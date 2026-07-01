import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { NodeIO } from "@gltf-transform/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGETS = [
  join(__dirname, "../assets/3d/scion-tc-2012.glb"),
  join(__dirname, "../assets/3d/Scion TC 2012.glb"),
];

const WHEEL_MATERIALS = new Set(["wheel", "tire", "material_6", "matteblackwheel"]);

function srgbChannelToLinear(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function hexToLinearFactor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b), 1];
}

// Toyota 1G3 Magnetic Gray Metallic — dark charcoal, not bright silver.
const MAGNETIC_GRAY = hexToLinearFactor("#4E5256");
const MATTE_BLACK = hexToLinearFactor("#121212");

function applyBodyPaint(material) {
  material.setBaseColorTexture(null);
  material.setMetallicRoughnessTexture(null);
  material.setNormalTexture(null);
  material.setBaseColorFactor(MAGNETIC_GRAY);
  material.setMetallicFactor(0.62);
  material.setRoughnessFactor(0.44);
  material.setAlphaMode("OPAQUE");
  material.setDoubleSided(true);
  material.setEmissiveFactor([0, 0, 0]);
}

function applyWheelPaint(material) {
  material.setBaseColorTexture(null);
  material.setMetallicRoughnessTexture(null);
  material.setBaseColorFactor(MATTE_BLACK);
  material.setMetallicFactor(0.15);
  material.setRoughnessFactor(0.65);
  material.setAlphaMode("OPAQUE");
  material.setDoubleSided(true);
}

const io = new NodeIO();

for (const targetPath of TARGETS) {
  const document = await io.read(targetPath);
  const root = document.getRoot();
  let body = 0;
  let wheels = 0;

  for (const material of root.listMaterials()) {
    const name = (material.getName() || "").toLowerCase();

    if (WHEEL_MATERIALS.has(name)) {
      applyWheelPaint(material);
      wheels += 1;
      continue;
    }

    applyBodyPaint(material);
    body += 1;
  }

  await io.write(targetPath, document);
  console.log(`${targetPath.split("/").pop()}: ${body} body + ${wheels} wheel (${readFileSync(targetPath).length} bytes)`);
}
