import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

// Direct Wi-Fi LAN URL (Always Stable, No Timeout, Gigabit speed on DC Wi-Fi)
const publicUrl = 'http://172.17.185.51:3000';
const publicDir = path.resolve('public');
const artifactDir = 'C:\\Users\\Beam\\.gemini\\antigravity\\brain\\0ea1f78c-9ad2-4895-bd3a-dd0b1720f46e';

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

async function run() {
  const publicPath = path.join(publicDir, 'smart-dc-qr.png');
  const artifactPath = path.join(artifactDir, 'smart-dc-qr.png');

  const options = {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    quality: 1,
    margin: 2,
    scale: 10,
    color: {
      dark: '#12803C', // Modern Forest Green
      light: '#FFFFFF'
    }
  };

  await QRCode.toFile(publicPath, publicUrl, options);
  console.log(`Saved Public QR to: ${publicPath}`);

  if (fs.existsSync(artifactDir)) {
    await QRCode.toFile(artifactPath, publicUrl, options);
    console.log(`Saved Public QR to artifact: ${artifactPath}`);
  }

  const svgString = await QRCode.toString(publicUrl, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 2,
    color: {
      dark: '#12803C',
      light: '#FFFFFF'
    }
  });

  const svgPath = path.join(publicDir, 'smart-dc-qr.svg');
  fs.writeFileSync(svgPath, svgString, 'utf8');
  console.log(`Saved SVG QR to: ${svgPath}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
