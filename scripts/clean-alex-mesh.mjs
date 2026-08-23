import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_MESH_RE = /wolf3d_outfit_top|wolf3d_head/i;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = path.join(root, "public", "models", "alex.glb");

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const VEC_ELEMS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function parseGlb(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  let offset = 20 + jsonLen;
  if (offset % 4) offset += 4 - (offset % 4);
  const binLen = buf.readUInt32LE(offset);
  const bin = Buffer.from(buf.subarray(offset + 8, offset + 8 + binLen));
  return { json, bin };
}

function writeGlb(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad, 0)]);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.write("glTF", 0, 4, "ascii");
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binOff = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binOff);
  out.writeUInt32LE(0x004e4942, binOff + 4);
  binChunk.copy(out, binOff + 8);
  return out;
}

function accessorStart(json, accessor) {
  const view = json.bufferViews[accessor.bufferView];
  return (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
}

function readIndex(bin, byteOffset, componentType) {
  if (componentType === 5121) return bin.readUInt8(byteOffset);
  if (componentType === 5123) return bin.readUInt16LE(byteOffset);
  if (componentType === 5125) return bin.readUInt32LE(byteOffset);
  throw new Error(`Unsupported index type ${componentType}`);
}

function writeIndex(buf, byteOffset, componentType, value) {
  if (componentType === 5121) buf.writeUInt8(value, byteOffset);
  else if (componentType === 5123) buf.writeUInt16LE(value, byteOffset);
  else if (componentType === 5125) buf.writeUInt32LE(value, byteOffset);
}

function isSpikeVertex(x, y, z) {
  if (z > 0.015 && y < -0.05) return true;
  // RPM bind-pose necktie strip (narrow X, forward Z, below the chin).
  return Math.abs(x) < 0.06 && z > 0.11 && y < 1.56 && y > 1.05;
}

function stripMeshTriangles(json, bin, mesh) {
  let totalDropped = 0;
  for (const prim of mesh.primitives ?? []) {
    const posAcc = json.accessors[prim.attributes.POSITION];
    const idxAcc = json.accessors[prim.indices];
    if (!posAcc || idxAcc == null) continue;
    const mode = prim.mode ?? 4;
    if (mode !== 4) continue;

    const posView = json.bufferViews[posAcc.bufferView];
    const posStart = accessorStart(json, posAcc);
    const posStride = posView.byteStride || VEC_ELEMS[posAcc.type] * COMPONENT_BYTES[posAcc.componentType];
    const spike = new Uint8Array(posAcc.count);
    for (let i = 0; i < posAcc.count; i += 1) {
      const o = posStart + i * posStride;
      const x = bin.readFloatLE(o);
      const y = bin.readFloatLE(o + 4);
      const z = bin.readFloatLE(o + 8);
      if (isSpikeVertex(x, y, z)) spike[i] = 1;
    }

    const idxType = idxAcc.componentType;
    const idxBytes = COMPONENT_BYTES[idxType];
    const idxStart = accessorStart(json, idxAcc);
    const triCount = Math.floor(idxAcc.count / 3);
    const kept = [];
    let dropped = 0;
    for (let t = 0; t < triCount; t += 1) {
      const a = readIndex(bin, idxStart + (t * 3) * idxBytes, idxType);
      const b = readIndex(bin, idxStart + (t * 3 + 1) * idxBytes, idxType);
      const c = readIndex(bin, idxStart + (t * 3 + 2) * idxBytes, idxType);
      if (spike[a] || spike[b] || spike[c]) {
        dropped += 1;
        continue;
      }
      kept.push(a, b, c);
    }

    if (dropped === 0) continue;
    const outBytes = Buffer.alloc(kept.length * idxBytes);
    for (let i = 0; i < kept.length; i += 1) writeIndex(outBytes, i * idxBytes, idxType, kept[i]);
    const aligned = Buffer.concat([outBytes, Buffer.alloc((4 - (outBytes.length % 4)) % 4, 0)]);
    const newOffset = bin.length;
    bin = Buffer.concat([bin, aligned]);
    json.bufferViews.push({
      buffer: 0,
      byteOffset: newOffset,
      byteLength: outBytes.length,
      target: 34963,
    });
    idxAcc.bufferView = json.bufferViews.length - 1;
    idxAcc.byteOffset = 0;
    idxAcc.count = kept.length;
    totalDropped += dropped;
    console.log(`${mesh.name}: dropped ${dropped} triangles, kept ${kept.length / 3}`);
  }
  return { bin, dropped: totalDropped };
}

let { json, bin } = parseGlb(fs.readFileSync(srcPath));
json.bufferViews = json.bufferViews ?? [];
let dropped = 0;
for (const mesh of json.meshes ?? []) {
  if (!TARGET_MESH_RE.test(mesh.name ?? "")) continue;
  const result = stripMeshTriangles(json, bin, mesh);
  bin = result.bin;
  dropped += result.dropped;
}
if (json.buffers?.[0]) json.buffers[0].byteLength = bin.length;

const out = writeGlb(json, bin);
fs.writeFileSync(srcPath, out);
console.log("wrote", srcPath, out.length, "bytes; triangles removed:", dropped);
