import { User } from '@models/User';
import { mention, shortTimeDisplay } from '@utils/text';

export abstract class ReviewAction {
  private readonly _actionTime: number;
  protected constructor(actionTime: number) {
    this._actionTime = actionTime;
  }

  get actionTime(): number {
    return this._actionTime;
  }

  abstract toMarkdown(): string;
}

abstract class UserReviewAction extends ReviewAction {
  private readonly _user: User;
  protected constructor(actionTime: number, user: User) {
    super(actionTime);
    this._user = user;
  }

  get user(): User {
    return this._user;
  }
}

export class AcceptedReviewAction extends UserReviewAction {
  constructor(actionTime: number, user: User) {
    super(actionTime, user);
  }

  toMarkdown(): string {
    return `${shortTimeDisplay(this.actionTime)} accepted by ${mention(this.user)}`;
  }
}

export class DeclinedReviewAction extends UserReviewAction {
  constructor(actionTime: number, user: User) {
    super(actionTime, user);
  }

  toMarkdown(): string {
    return `${shortTimeDisplay(this.actionTime)} declined by ${mention(this.user)}`;
  }
}

export class CreatedReviewAction extends ReviewAction {
  constructor(actionTime: number) {
    super(actionTime);
  }

  toMarkdown(): string {
    return `${shortTimeDisplay(this.actionTime)} review requested`;
  }
}

export class PendingReviewAction extends UserReviewAction {
  constructor(actionTime: number, user: User) {
    super(actionTime, user);
  }

  toMarkdown(): string {
    return `\`now\` with ${mention(this.user)} and expires after ${shortTimeDisplay(
      this.actionTime,
    )}`;
  }
}
