import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DROP_MESH_RE = /wolf3d_body|wolf3d_outfit_bottom|wolf3d_outfit_footwear|beard|facewear|tie|strap/i;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = path.join(root, "public", "models", "alex.glb");

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

const { json, bin } = parseGlb(fs.readFileSync(srcPath));
const dropMeshIdx = new Set();
(json.meshes ?? []).forEach((mesh, index) => {
  if (DROP_MESH_RE.test(mesh.name ?? "")) dropMeshIdx.add(index);
});

const meshMap = new Map();
json.meshes = (json.meshes ?? []).filter((mesh, index) => {
  if (dropMeshIdx.has(index)) {
    console.log("drop mesh", mesh.name);
    return false;
  }
  meshMap.set(index, meshMap.size);
  return true;
});

for (const node of json.nodes ?? []) {
  if (node.mesh == null) continue;
  if (dropMeshIdx.has(node.mesh) || DROP_MESH_RE.test(node.name ?? "")) {
    console.log("detach node mesh", node.name);
    delete node.mesh;
    continue;
  }
  node.mesh = meshMap.get(node.mesh);
}

const out = writeGlb(json, bin);
fs.writeFileSync(srcPath, out);
console.log("wrote", srcPath, out.length, "bytes; remaining meshes:", (json.meshes ?? []).map((m) => m.name).join(", "));
