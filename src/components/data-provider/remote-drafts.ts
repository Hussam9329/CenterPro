/** Tracks mounted drafts without storing form contents or credentials. */
export class RemoteDrafts {
  private edited = new Set<Element>();
  private conflicted = new Set<Element>();

  readonly conflictMessage = 'تغيّرت البيانات من جهاز آخر. أعد فتح النموذج، أو ألغِ التغييرات لمراجعة البيانات الجديدة قبل الحفظ.';

  readonly markEdited = (event: Event) => {
    const target = event.target;
    if (target instanceof Element) {
      const form = target.closest('form');
      if (form) this.edited.add(form);
    }
  };

  isEditing() {
    for (const form of this.edited) if (!form.isConnected) this.edited.delete(form);
    return Boolean(document.querySelector('[role="dialog"]') || this.edited.size > 0);
  }

  assertNoConflicts() {
    for (const form of this.conflicted) if (!form.isConnected) this.conflicted.delete(form);
    if (this.conflicted.size) throw new Error(this.conflictMessage);
  }

  markConflicts(includeDialogs = false) {
    for (const form of this.edited) if (form.isConnected) this.conflicted.add(form);
    if (includeDialogs) {
      for (const dialog of document.querySelectorAll('[role="dialog"]')) this.conflicted.add(dialog);
    }
  }

  hasConflicts() { return this.conflicted.size > 0; }

  saved(form?: HTMLFormElement) {
    // Saving one Settings form must preserve every other pending draft.
    if (form) this.edited.delete(form);
    else this.edited.clear();
  }

  discard(form: HTMLFormElement | null) {
    if (!form) return;
    this.edited.delete(form);
    this.conflicted.delete(form);
  }
}
