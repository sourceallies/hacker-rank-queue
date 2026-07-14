import { ActionId, BlockId, Interaction, InterviewFormat, formatLabel } from '@bot/enums';
import { PairingSession } from '@models/PairingSession';
import { Button, KnownBlock, View } from '@slack/types';
import { PAIRING_SESSION_HOURS, groupByDate } from '@utils/pairingSlots';
import { bold, compose, formatDate, formatSlot, formatTime, textBlock, ul } from '@utils/text';

/** A slot as the open picker knows it. Snapshotted so a repaint needs no database read. */
export interface PickerSlot {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * The picker's whole world, carried in private_metadata.
 *
 * The snapshot is here rather than re-read per tap because getByThreadIdOrUndefined pulls every row
 * of the sheet, and a repaint that costs a full fetch would burn the read quota on a fast clicker.
 * A view is a pure function of (slots, selected) — selection is never inferred from button styling,
 * so a chip styled for some other reason later can't read as picked.
 *
 * `dmTs` is captured on open because a view_submission payload carries no `message`, and it's the
 * only handle on the DM we later collapse.
 */
export interface PickerMeta {
  threadId: string;
  dmTs: string;
  candidateName: string;
  languages: string[];
  format: InterviewFormat;
  slots: PickerSlot[];
  selected: number[];
}

/** Slack allows 3000 characters of private_metadata; JSON objects per slot would crowd it. */
function encodeSlots(slots: PickerSlot[]): string {
  return slots.map(s => `${s.date}|${s.startTime}|${s.endTime}`).join(';');
}

function decodeSlots(encoded: string): PickerSlot[] {
  if (!encoded) return [];
  return encoded.split(';').map(entry => {
    const [date, startTime, endTime] = entry.split('|');
    return { date, startTime, endTime };
  });
}

export function serializeMeta(meta: PickerMeta): string {
  return JSON.stringify({ ...meta, slots: encodeSlots(meta.slots) });
}

export function parseMeta(privateMetadata: string | undefined): PickerMeta {
  const raw = JSON.parse(privateMetadata || '{}');
  return { ...raw, slots: decodeSlots(raw.slots ?? ''), selected: raw.selected ?? [] };
}

export function snapshotOf(session: PairingSession): PickerSlot[] {
  return session.slots.map(({ date, startTime, endTime }) => ({ date, startTime, endTime }));
}

export function toggleSelection(selected: number[], index: number): number[] {
  return selected.includes(index)
    ? selected.filter(i => i !== index)
    : [...selected, index].sort((a, b) => a - b);
}

export function timeToggleActionId(index: number): string {
  return `${ActionId.PAIRING_TOGGLE_TIME}-${index}`;
}

/** Matches every chip in the grid, whatever its index. */
export const TIME_TOGGLE_PATTERN = new RegExp(`^${ActionId.PAIRING_TOGGLE_TIME}-(\\d+)$`);

export function chipIndexFrom(actionId: string): number | undefined {
  const match = TIME_TOGGLE_PATTERN.exec(actionId);
  return match ? Number(match[1]) : undefined;
}

function chip(slot: PickerSlot, index: number, isSelected: boolean): Button {
  return {
    type: 'button',
    action_id: timeToggleActionId(index),
    text: { type: 'plain_text', text: formatTime(slot.startTime) },
    value: String(index),
    ...(isSelected ? { style: 'primary' as const } : {}),
  };
}

function summaryBlock(slots: PickerSlot[], selected: number[]): KnownBlock {
  const picked = selected.map(i => slots[i]).filter(slot => slot != null);
  const text =
    picked.length === 0
      ? "You haven't picked any times yet. Submitting now passes on this session."
      : compose(
          bold(`${picked.length} picked:`),
          ul(...picked.map(s => formatSlot(s.date, s.startTime, s.endTime))),
        );
  return { ...textBlock(text), block_id: BlockId.PAIRING_PICKER_SUMMARY } as KnownBlock;
}

/**
 * Slack's client renders only the first five buttons of an actions block and hides the rest behind
 * a "+N more" overflow — whatever the API's 25-element limit says. A day of 8 AM–5 PM is seven
 * chips, so two of them would vanish, and a repaint would swallow a selected chip right back under
 * the fold. Chunking below the display limit keeps every time visible.
 */
const CHIPS_PER_ROW = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function buildPickerBlocks(meta: PickerMeta): KnownBlock[] {
  const selected = new Set(meta.selected);

  const blocks: KnownBlock[] = [
    textBlock(
      compose(
        `Pairing with *${meta.candidateName}* — ${meta.languages.join(', ')}, ${formatLabel(meta.format)}.`,
        `Each time below starts a *${PAIRING_SESSION_HOURS} hour* session. Tap every one that works for you. All times Central.`,
      ),
    ),
  ];

  for (const [date, slots] of groupByDate(meta.slots)) {
    blocks.push(textBlock(bold(formatDate(date))));
    for (const row of chunk(slots, CHIPS_PER_ROW)) {
      blocks.push({
        type: 'actions',
        elements: row.map(({ item, index }) => chip(item, index, selected.has(index))),
      });
    }
  }

  blocks.push({ type: 'divider' });
  blocks.push(summaryBlock(meta.slots, meta.selected));

  return blocks;
}

export function pickerView(meta: PickerMeta): View {
  return {
    type: 'modal',
    callback_id: Interaction.SUBMIT_PAIRING_TIMES,
    title: { type: 'plain_text', text: 'Pick your times' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    private_metadata: serializeMeta(meta),
    blocks: buildPickerBlocks(meta),
  };
}
