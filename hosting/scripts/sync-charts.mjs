import { cp, mkdir, rm } from "node:fs/promises";

const source = new URL("../../showdivisionraces/dist/", import.meta.url);
const target = new URL("../public/charts/", import.meta.url);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
