/** A menu's taps must not reach the swing handler on window: its pointerdown stops at `root`. */
export function keepTapsFromSwing(root: HTMLElement): void {
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
}
