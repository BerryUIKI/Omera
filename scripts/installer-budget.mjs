import { lstatSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectInstallers } from './update-signing.mjs';

// Reviewed against the public v0.5.2 assets. AppImage includes its Linux runtime.
export const installerBudgetsMiB = Object.freeze({exe:25, msi:40, dmg:25, AppImage:120, deb:40, rpm:40});
export function requireInstallerBudgets(assets, stat = lstatSync) {
  if (!assets.length) throw new Error('No installers to measure');
  return assets.map(asset => {
    const name = basename(asset), extension = name.split('.').pop();
    const budget = installerBudgetsMiB[extension];
    if (!budget) throw new Error(`Unsupported installer format: ${name}`);
    const info = stat(asset), limit = budget * 1024 * 1024;
    if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size <= 0)
      throw new Error(`Expected a nonempty regular installer: ${name}`);
    if (info.size > limit) throw new Error(`${name}: ${(info.size / 1024 / 1024).toFixed(2)} MiB exceeds ${budget} MiB budget`);
    return {name, bytes:info.size, limit};
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: installer-budget.mjs <bundle-directory>');
    for (const report of requireInstallerBudgets(collectInstallers(resolve(process.argv[2]))))
      console.log(`${report.name}: ${(report.bytes / 1024 / 1024).toFixed(2)} MiB / ${report.limit / 1024 / 1024} MiB`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
