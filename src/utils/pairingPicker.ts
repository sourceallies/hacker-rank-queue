import { ActionId, BlockId, Interaction, InterviewFormatLabel } from '@bot/enums';
import { PairingSession, PairingSlot } from '@models/PairingSession';
import { Button, KnownBlock, View } from '@slack/types';
import { PAIRING_SESSION_HOURS, groupSlotsByDate, sessionEndTime } from '@utils/pairingSlots';
import { bold, compose, formatDate, formatSlot, formatTime, ul } from '@utils/text';

/**
 * Carried in the picker's private_metadata. Selections are indices into `session.slots` rather than
 * slot ids — uuids would eat most of Slack's 3000 character metadata budget for no benefit.
 *
 * `dmTs` is captured when the picker opens because a view_submission payload has no `message`, and
 * it's the only way to collapse the teammate's DM once they've submitted.
 */
export interface PickerMeta {
  threadId: string;
  dmTs: string;
  selected: number[];
}

/** Everything a repaint needs about one chip, so a toggle never has to re-read the session. */
interface Chip {
  index: number;
  date: string;
  startTime: string;
}

export function timeToggleActionId(index: number): string {
  return `${ActionId.PAIRING_TOGGLE_TIME}-${index}`;
}

/** Matches every chip in the grid, whatever its index. */
export const TIME_TOGGLE_PATTERN = new RegExp(`^${ActionId.PAIRING_TOGGLE_TIME}-\\d+$`);

function encodeChip(chip: Chip): string {
  return `${chip.index}|${chip.date}|${chip.startTime}`;
}

function decodeChip(value: string): Chip | undefined {
  const [index, date, startTime] = value.split('|');
  if (!date || !startTime || !Number.isInteger(Number(index))) return undefined;
  return { index: Number(index), date, startTime };
}

function summaryText(picks: Chip[]): string {
  if (picks.length === 0) {
    return "You haven't picked any times yet. Submitting now passes on this session.";
  }
  const lines = picks.map(p => formatSlot(p.date, p.startTime, sessionEndTime(p.startTime)));
  return compose(bold(`${picks.length} picked:`), ul(...lines));
}

function summaryBlock(picks: Chip[]): KnownBlock {
  return {
    block_id: BlockId.PAIRING_PICKER_SUMMARY,
    type: 'section',
    text: { type: 'mrkdwn', text: summaryText(picks) },
  };
}

function chipButton(slot: PairingSlot, index: number, isSelected: boolean): Button {
  return {
    type: 'button',
    action_id: timeToggleActionId(index),
    text: { type: 'plain_text', text: formatTime(slot.startTime) },
    value: encodeChip({ index, date: slot.date, startTime: slot.startTime }),
    ...(isSelected ? { style: 'primary' as const } : {}),
  };
}

export function buildPickerBlocks(session: PairingSession, selected: number[]): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: compose(
          `Pairing with *${session.candidateName}* — ${session.languages.join(', ')}, ${
            InterviewFormatLabel.get(session.format) ?? session.format
          }.`,
          `Each time below starts a *${PAIRING_SESSION_HOURS} hour* session. Tap every one that works for you. All times Central.`,
        ),
      },
    },
  ];

  const indexOfSlot = new Map(session.slots.map((slot, i) => [slot, i]));

  for (const [date, slots] of groupSlotsByDate(session.slots)) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: bold(formatDate(date)) } });
    blocks.push({
      type: 'actions',
      elements: slots.map(slot => {
        const index = indexOfSlot.get(slot) as number;
        return chipButton(slot, index, selected.includes(index));
      }),
    });
  }

  const picks = selected
    .map(index => ({ index, slot: session.slots[index] }))
    .filter(({ slot }) => slot != null)
    .map(({ index, slot }) => ({ index, date: slot.date, startTime: slot.startTime }));

  blocks.push({ type: 'divider' });
  blocks.push(summaryBlock(picks));

  return blocks;
}

/**
 * Repaints the grid from the view Slack just handed us, rather than rebuilding it from the session.
 *
 * The session can't change while the picker is open, and re-reading it would cost a full Google
 * Sheets fetch on every single tap — so the chips carry their own date and start time, and a toggle
 * is a pure transform of the blocks that are already on screen.
 */
export function applyToggle(
  blocks: KnownBlock[],
  index: number,
): { blocks: KnownBlock[]; selected: number[] } {
  const picks: Chip[] = [];

  const repainted = blocks.map((block): KnownBlock => {
    if (block.type !== 'actions') return block;
    return {
      ...block,
      elements: block.elements.map(element => {
        const button = element as Button;
        if (button.type !== 'button') return element;

        const chip = decodeChip(button.value ?? '');
        if (!chip) return element;

        const isSelected = chip.index === index ? button.style !== 'primary' : !!button.style;
        if (isSelected) picks.push(chip);

        const { style: _dropped, ...rest } = button;
        return isSelected ? { ...rest, style: 'primary' as const } : rest;
      }),
    };
  });

  picks.sort((a, b) => a.index - b.index);

  return {
    blocks: repainted.map(block =>
      block.block_id === BlockId.PAIRING_PICKER_SUMMARY ? summaryBlock(picks) : block,
    ),
    selected: picks.map(p => p.index),
  };
}

export function buildPickerView(session: PairingSession, meta: PickerMeta): View {
  return viewFrom(buildPickerBlocks(session, meta.selected), meta);
}

export function viewFrom(blocks: KnownBlock[], meta: PickerMeta): View {
  return {
    type: 'modal',
    callback_id: Interaction.SUBMIT_PAIRING_TIMES,
    title: { type: 'plain_text', text: 'Pick your times' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    private_metadata: JSON.stringify(meta),
    blocks,
  };
}
