import type { ChallengeConfig } from '../../shared/contracts';

type PracticeGuide = {
  title: string;
  steps: string[];
  controls: string[];
};

export function practiceGuide(config: ChallengeConfig): PracticeGuide {
  const { templateId, targetDistance, requiredSpinDegrees, referenceClipId } = config;
  const target = `the ${targetDistance}m target`;
  const presets: Record<ChallengeConfig['templateId'], PracticeGuide> = {
    jump: {
      title: 'Rooftop jump shot',
      steps: [
        `Face ${target} from the rooftop.`,
        `Press Space to jump, then aim at ${target} and fire before landing.`,
      ],
      controls: ['Space to jump'],
    },
    spin180: {
      title: 'Rooftop 180° shot',
      steps: [
        'Start facing away from the target. Press Space to jump from that position.',
        `Turn back toward ${target} while airborne. Get at least 180° of net rotation from your takeoff heading.`,
        'Fire at the target before landing. Reversing your turn reduces your net rotation.',
      ],
      controls: ['Space to jump'],
    },
    spin360: {
      title: 'Rooftop 360° shot',
      steps: [
        `Start facing ${target}. Press Space to jump from that position.`,
        'Make a full 360° turn in the air and bring your aim back to the target. Net rotation is measured from your takeoff heading.',
        'Fire at the target before landing. Reversing your turn reduces your net rotation.',
      ],
      controls: ['Space to jump'],
    },
    'ramp-shot': {
      title: 'Buildyard ramp shot',
      steps: [
        'Stand outside the build slot and press B to place the ramp.',
        'Walk up onto the ramp. Press Space while still on the ramp to jump from it.',
        `Aim at ${target} and fire before landing.`,
      ],
      controls: ['B to build the ramp', 'Space to jump'],
    },
    'wall-edit': {
      title: 'Buildyard wall edit',
      steps: [
        'Stand outside the build slot. Press B to place the wall, then G to open the upper panel.',
        'Stay on the near side of the wall and press Space to jump.',
        `While airborne, aim through the upper opening and fire at ${target}.`,
      ],
      controls: ['B to build the wall', 'G to edit the wall', 'Space to jump'],
    },
    precision: {
      title: 'Courtyard precision shot',
      steps: [
        `Find a clear line to ${target} and stay grounded.`,
        'Release WASD and come to a stop.',
        'Aim and fire while standing still.',
      ],
      controls: [],
    },
    'dash-peek': {
      title: 'Courtyard dash peek',
      steps: [
        'Start on the ground behind the left crate, with the crate blocking your view of the target.',
        'Press X once to dash 4m to the right into the clear lane.',
        `Release WASD, let the dash finish, and come to a stop. Aim at ${target} and fire while grounded and still.`,
      ],
      controls: ['X to dash right from cover'],
    },
  };

  const preset = presets[templateId];
  const steps = [...preset.steps];
  if (referenceClipId) {
    steps.unshift('Watch the reference clip for inspiration, then use these steps to practice your version of the shot.');
  }

  const controls = [
    'Choose Keyboard Start to play with the keyboard, or Enter the Arena to capture the mouse.',
    'WASD to move',
    'Q/E or Left/Right arrows to turn',
    'Up/Down arrows to aim vertically, or move the captured mouse to aim',
    ...preset.controls,
    'C to toggle aim down sights (ADS)',
    'F or a captured mouse click to fire',
    'R to retry',
    'Esc to release the mouse',
  ];
  if (requiredSpinDegrees === 0) {
    controls.push('ALIGN AIM button to point at the target');
  }

  return { title: preset.title, steps, controls };
}
