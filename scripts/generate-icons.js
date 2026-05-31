const sharp = require("sharp");
const path = require("path");

const input = path.join(__dirname, "../assets/images/icon.png");

async function generate() {
  await sharp(input)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(__dirname, "../assets/images/adaptive-icon.png"));

  await sharp(input)
    .resize(1242, 2436)
    .extend({
      top: 300,
      bottom: 300,
      left: 120,
      right: 120,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toFile(path.join(__dirname, "../assets/images/splash-icon.png"));

  console.log("Icons generated successfully.");
}

generate();