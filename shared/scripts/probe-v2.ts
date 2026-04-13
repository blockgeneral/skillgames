import { generateMaze } from '../src/maze/generator.js';
import type { Difficulty, CellType } from '../src/types.js';

function countFloors(c: ReadonlyArray<ReadonlyArray<CellType>>): number {
  let n = 0; for (const r of c) for (const x of r) if (x === 'floor') n++; return n;
}

function render(cells: ReadonlyArray<ReadonlyArray<CellType>>, sx: number, sy: number): string {
  const lines: string[] = [];
  for (let y = 0; y < cells.length; y++) {
    const row: string[] = [];
    for (let x = 0; x < cells[y]!.length; x++) {
      if (x === sx && y === sy) row.push('S');
      else if (cells[y]![x] === 'floor') row.push('.');
      else row.push('#');
    }
    lines.push(row.join(' '));
  }
  return lines.join('\n');
}

const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
for (const d of difficulties) {
  console.log(`\n========== ${d} ==========`);
  const times: number[] = [];
  let ok = 0, budgetExceeded = 0, constraintsUnmet = 0, otherErr = 0;
  for (let i = 0; i < 10; i++) {
    const seed = i.toString(16).padStart(64, '0');
    const t0 = Date.now();
    try {
      const maze = generateMaze(seed, d);
      const dt = Date.now() - t0;
      times.push(dt);
      const floors = countFloors(maze.cells);
      console.log(`seed=${i} time=${dt}ms floors=${floors} lowerBound=${maze.minimumMoveLowerBound} OK`);
      if (i === 0) {
        console.log('--- sample render ---');
        console.log(render(maze.cells, maze.startPosition.x, maze.startPosition.y));
      }
      ok++;
    } catch (e) {
      const dt = Date.now() - t0;
      const msg = (e as Error).message;
      console.log(`seed=${i} time=${dt}ms THREW: ${msg.slice(0, 80)}`);
      if (msg.startsWith('GeneratorBudgetExceeded')) budgetExceeded++;
      else if (msg.startsWith('GeneratorConstraintsUnmet')) constraintsUnmet++;
      else otherErr++;
    }
  }
  console.log(`\n${d}: ok=${ok} budget=${budgetExceeded} constraints=${constraintsUnmet} other=${otherErr}`);
  if (times.length > 0) {
    times.sort((a, b) => a - b);
    console.log(`times: min=${times[0]} p50=${times[Math.floor(times.length/2)]} max=${times[times.length-1]}`);
  }
}
