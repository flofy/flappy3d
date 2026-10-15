<script>
  import { createJoystick } from '../lib/input.js';

  /**
   * @type {{ store: {x: number, y: number}, label?: string }}
   */
  let { store, label = 'Joystick' } = $props();

  let root = $state(null);
  let knob = $state(null);
  let dragging = $state(false);
  let visible = $state(false);

  $effect(() => {
    if (!root || !knob) return;
    const joystick = createJoystick(root);
    let raf = 0;

    const tick = () => {
      const v = joystick.read();
      store.x = v.x;
      store.y = v.y;
      knob.style.transform = `translate(${v.x * 40}px, ${v.y * -40}px)`;
      const nowDragging = joystick.active;
      if (nowDragging !== dragging) {
        dragging = nowDragging;
        visible = true;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      joystick.dispose();
      store.x = 0;
      store.y = 0;
    };
  });
</script>

<div
  class="joystick"
  bind:this={root}
  class:active={dragging}
  role="application"
  aria-label={label}
>
  <div class="ring"></div>
  <div class="knob" bind:this={knob}></div>
</div>

<style>
  .joystick {
    position: relative;
    width: 128px;
    height: 128px;
    display: grid;
    place-items: center;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid rgba(150, 170, 240, 0.35);
    background: radial-gradient(
      circle at 50% 50%,
      rgba(55, 224, 200, 0.1),
      rgba(10, 16, 34, 0.5)
    );
    backdrop-filter: blur(6px);
  }

  .knob {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #37e0c8, #7c8cff);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    transition: transform 0.05s linear;
    pointer-events: none;
  }

  .joystick.active .ring {
    border-color: rgba(55, 224, 200, 0.75);
  }
</style>
