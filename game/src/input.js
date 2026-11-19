// Keyboard + mouse input for VERANO HEAT. One shared Input object:
// movement keys, aim from the mouse, and edge-triggered presses.

export class Input {
  constructor(canvas) {
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
    this.handbrake = false;
    this.sprint = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.wheelHeld = false;
    /** Keys pressed since the last consume (edge triggers). */
    this.pressed = new Set();
    this.keys = new Set();
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      this.sync();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      this.sync();
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  sync() {
    const k = this.keys;
    this.up = k.has('w') || k.has('arrowup');
    this.down = k.has('s') || k.has('arrowdown');
    this.left = k.has('a') || k.has('arrowleft');
    this.right = k.has('d') || k.has('arrowright');
    this.handbrake = k.has(' ');
    this.sprint = k.has('shift');
    this.wheelHeld = k.has('q');
  }

  /** True once for a key pressed since the last call. */
  wasPressed(key) {
    const k = key.toLowerCase();
    if (this.pressed.has(k)) {
      this.pressed.delete(k);
      return true;
    }
    return false;
  }

  /** Clear edge triggers (call at the end of each frame). */
  endFrame() {
    this.pressed.clear();
  }
}
