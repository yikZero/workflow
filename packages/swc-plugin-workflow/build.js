import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runCommand(command) {
  try {
    execSync(command, { stdio: 'inherit', shell: true });
  } catch (error) {
    console.error(`Command failed: ${command}: ${error}`);
    process.exit(1);
  }
}

function commandExists(command) {
  try {
    execSync(`${command} --version`, { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

function generateBuildHash(wasmDest) {
  console.log('Generating build hash...');
  const wasmContent = readFileSync(wasmDest);
  const buildHash = createHash('sha256')
    .update(wasmContent)
    .digest('hex')
    .slice(0, 16);
  const buildHashPath = new URL('build-hash.json', import.meta.url);
  writeFileSync(buildHashPath, JSON.stringify({ buildHash }, null, 2));
  console.log(`Build hash: ${buildHash}`);
}

async function fetchPackageMetadata(name, version) {
  const packagePath = encodeURIComponent(name).replace('%40', '@');
  const metadataUrl = `https://registry.npmjs.org/${packagePath}/${version}`;
  const response = await fetch(metadataUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch npm metadata (${response.status} ${response.statusText})`
    );
  }

  return response.json();
}

async function downloadPublishedWasm(reason) {
  console.log(`Falling back to published WASM artifact: ${reason}`);

  const packageJsonPath = new URL('package.json', import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const metadata = await fetchPackageMetadata(
    packageJson.name,
    packageJson.version
  );
  const tarballUrl = metadata?.dist?.tarball;

  if (!tarballUrl) {
    throw new Error('Published package tarball URL was not found');
  }

  const tarballResponse = await fetch(tarballUrl);
  if (!tarballResponse.ok) {
    throw new Error(
      `Failed to download package tarball (${tarballResponse.status} ${tarballResponse.statusText})`
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'workflow-swc-plugin-'));

  try {
    const tarballPath = join(tempDir, 'package.tgz');
    const extractedWasmPath = join(
      tempDir,
      'package',
      'swc_plugin_workflow.wasm'
    );
    writeFileSync(
      tarballPath,
      Buffer.from(await tarballResponse.arrayBuffer())
    );

    execSync(
      `tar -xzf "${tarballPath}" -C "${tempDir}" package/swc_plugin_workflow.wasm`,
      { stdio: 'inherit', shell: true }
    );

    if (!existsSync(extractedWasmPath)) {
      throw new Error(
        'Published tarball did not contain swc_plugin_workflow.wasm'
      );
    }

    const wasmDest = new URL('swc_plugin_workflow.wasm', import.meta.url);
    console.log('Copying published WASM file...');
    copyFileSync(extractedWasmPath, wasmDest);
    generateBuildHash(wasmDest);
    console.log('Build complete using published artifact!');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function ensureRustInstalled() {
  if (commandExists('cargo')) {
    return true;
  }

  if (!process.env.CI) {
    return false;
  }

  console.log('Installing Rust...');
  if (process.platform === 'win32') {
    runCommand(
      'powershell -Command "iwr https://win.rustup.rs -OutFile rustup-init.exe; .\\rustup-init.exe -y --profile minimal; del rustup-init.exe"'
    );
  } else {
    runCommand(
      'curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal'
    );
    const cargoPath = `${process.env.HOME}/.cargo/bin`;
    process.env.PATH = `${cargoPath}:${process.env.PATH}`;
    console.log('Rust installed and PATH updated');
  }

  return commandExists('cargo');
}

function ensureWasmTargetInstalled() {
  console.log('Checking wasm32-unknown-unknown target...');
  try {
    const installedTargets = execSync('rustup target list --installed', {
      stdio: 'pipe',
      shell: true,
    }).toString();
    if (!installedTargets.includes('wasm32-unknown-unknown')) {
      console.log('wasm32-unknown-unknown target not found, installing...');
      runCommand('rustup target add wasm32-unknown-unknown');
    } else {
      console.log('wasm32-unknown-unknown target already installed');
    }
  } catch (error) {
    console.error(
      'Failed to check/install wasm32-unknown-unknown target:',
      error.message
    );
    process.exit(1);
  }
}

async function main() {
  console.log('Building swc-plugin-workflow WASM...');

  if (!ensureRustInstalled()) {
    await downloadPublishedWasm('Rust is not installed in this environment');
    return;
  }

  if (!commandExists('cc')) {
    await downloadPublishedWasm(
      'a system C linker is not installed in this environment'
    );
    return;
  }

  ensureWasmTargetInstalled();

  console.log('Running cargo build...');
  runCommand('cargo build-wasm32 --release -p swc_plugin_workflow');

  const wasmSource = new URL(
    '../../target/wasm32-unknown-unknown/release/swc_plugin_workflow.wasm',
    import.meta.url
  );
  const wasmDest = new URL('swc_plugin_workflow.wasm', import.meta.url);
  console.log(`Source: ${wasmSource}`);
  console.log(`Destination: ${wasmDest}`);

  if (!existsSync(wasmSource)) {
    console.error(`WASM file not found at ${wasmSource}`);
    console.error(
      'The cargo build may have failed or produced output at a different location.'
    );

    try {
      const targetDir = new URL('../../target', import.meta.url);
      console.error('\nDebug: Listing target directory contents...');
      const files = readdirSync(targetDir, { recursive: true });
      const wasmFiles = files.filter(
        (f) => typeof f === 'string' && f.endsWith('.wasm')
      );
      console.error(
        `Found ${files.length} total files, ${wasmFiles.length} WASM-related`
      );
      if (wasmFiles.length > 0) {
        console.error('WASM files:', wasmFiles.slice(0, 10));
      } else {
        console.error('Sample files in target:', files.slice(0, 20));
      }
    } catch (err) {
      console.error('Debug: Cannot read target directory:', err.message);
    }

    process.exit(1);
  }

  console.log('Copying WASM file...');
  copyFileSync(wasmSource, wasmDest);
  generateBuildHash(wasmDest);
  console.log('Build complete!');
}

await main();
