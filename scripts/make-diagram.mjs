// 서비스 구조도 그림 만들기: scripts/diagram/architecture.html 을 Edge로 찍어 docs/diagrams/architecture.png 로 저장
// 실행: node scripts/make-diagram.mjs
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openEdge } from "./lib/edge.mjs";

const dir = fileURLToPath(new URL("./diagram/", import.meta.url));
const out = fileURLToPath(new URL("../docs/diagrams/", import.meta.url));
mkdirSync(out, { recursive: true });

const edge = await openEdge({ site: pathToFileURL(dir).href.replace(/\/$/, ""), width: 1600, height: 1000, scale: 1 });
try {
  await edge.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await edge.go("/architecture.html", 1500);
  await edge.shot(out + "architecture.png");
  console.log("🖼️ docs/diagrams/architecture.png");
} finally {
  await edge.close();
}
