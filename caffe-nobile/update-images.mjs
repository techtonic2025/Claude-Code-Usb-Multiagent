import { readFileSync, writeFileSync } from "node:fs";

const cssPath = new URL("./assets/css/design-system.css", import.meta.url);
let css = readFileSync(cssPath, "utf8");
css = css.replace('url("../img/hero.jpg")', 'url("../img/foto-hero.png")');
writeFileSync(cssPath, css, "utf8");
console.log("CSS hero updated");
