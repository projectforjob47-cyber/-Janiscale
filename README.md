# SMART DC — ระบบชั่งน้ำหนักและตรวจรับสินค้าสดดิจิทัล (Fresh Produce Digital Receiving & Catch-Weight Verification)

แอปพลิเคชัน Progressive Web App (PWA) สำหรับกระบวนการตรวจรับและสุ่มชั่งน้ำหนักสินค้าสด (Fresh Produce Receiving) ประจำศูนย์กระจายสินค้า (DC) ช่วยลดข้อผิดพลาดจากการจดมือ คำนวณเกณฑ์มาตรฐานและค่า CN อัตโนมัติ พร้อมระบบลงนามดิจิทัล 3-4 ฝ่าย และทำงานได้แบบ Offline-First

---

## 🚀 จุดเด่นของระบบ (Key Features)

1. **Hierarchy Navigation (งาน PR & VN)**:
   - นำทางตามโครงสร้างจริง: **ใบนัดหมาย (Appointment) $\rightarrow$ ผู้ขาย (Vendor) $\rightarrow$ ใบสั่งซื้อ (PO) $\rightarrow$ รายการสินค้า (ITEM)**
   - เรียงลำดับจากบนลงล่างตามแผนงาน ป้องกันการข้าม Vendor และข้าม PO
   - แสดงสถานะและแถบความคืบหน้าแบบ Real-time: `รอชั่ง (0/n หน่วย)` $\rightarrow$ `🔵 กำลังชั่ง (x/n หน่วย)` $\rightarrow$ `🟢 ✓ ชั่งครบแล้ว (n/n หน่วย)`

2. **สูตรมาตรฐานสินค้า (SP Calculation & Tolerance)**:
   - ดึงเกณฑ์คำนวณตามมาตรฐาน SP (เช่น SP10, SP15, SP20, 100%)
   - สุ่มชั่งตามขั้นบันได (2 ตะกร้า หรือ 5 ตะกร้า ตามปริมาณสินค้า)
   - หักน้ำหนักภาชนะอัตโนมัติ (ตะกร้าเขียว, ตะกร้าฟ้า, กล่อง/กระสอบ O)
   - ตรวจสอบเกณฑ์ขาดเกิน: **ห้ามขาด $\ge 0.01$ กก. และเพดานเกินไม่เกิน $+10\%$** หากตกเกณฑ์จะคำนวณผลต่างและสร้างเคส CN อัตโนมัติ

3. **สินค้าโฟกัส (FOCUS Items & LP Enforcement)**:
   - ตรวจจับสินค้าที่มีความเสี่ยงสูง (High Shrink) อัตโนมัติจาก Focus Master
   - บังคับการลงนามของ **เจ้าหน้าที่ DC S&LP Supervisor** ทุกครั้งที่มีสินค้า Focus ในใบนัดหมาย หากไม่ลงนามจะไม่สามารถปิดงานได้

4. **ระบบลงนามดิจิทัล (Digital Signatures & Workflow)**:
   - **งานประเภท VN**: Vendor/Driver $\rightarrow$ Receive $\rightarrow$ LP&S (ถ้ามี Focus) $\rightarrow$ หัวหน้างานประจำกะ OTM
   - **งานประเภท PR**: Receive $\rightarrow$ LP&S (ถ้ามี Focus) $\rightarrow$ หัวหน้างานประจำกะ OTM *(ยกเว้นลายเซ็น Vendor)*
   - ระบุและบันทึกสายการบังคับบัญชาประจำกะ (Shift Leader & Superior) ลงในประวัติใบนัดหมาย

5. **สถาปัตยกรรม Offline-First & Realtime Cloud Sync**:
   - ฐานข้อมูล **Dexie.js (IndexedDB)** ภายในเครื่อง ทำงานได้ลื่นไหลแม้ไม่มีสัญญาณอินเทอร์เน็ต
   - ซิงค์ขึ้น **Supabase (Cloud PostgreSQL)** แบบเรียลไทม์ และรองรับการส่งออกข้อมูลเข้า **Google Sheets / Excel**

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Lucide React Icons
- **Local Database**: Dexie.js (IndexedDB) with `dexie-react-hooks`
- **Cloud Database**: Supabase (PostgreSQL & Realtime WebSocket)
- **Export / Reporting**: SheetJS (`xlsx`), ExcelJS
- **Hosting / Deployment**: Vercel (PWA)

---

## 📦 การติดตั้งและรันในเครื่อง (Local Setup)

### 1. ความต้องการของระบบ (Prerequisites)
- [Node.js](https://nodejs.org/) (เวอร์ชัน 18 ขึ้นไป หรือ 20.x)
- npm (มาพร้อมกับ Node.js)

### 2. ขั้นตอนการติดตั้ง
```bash
# 1. เข้าสู่โฟลเดอร์โปรเจกต์
cd smart-dc

# 2. ติดตั้งแพ็กเกจที่จำเป็น
npm install

# 3. สร้างไฟล์ .env (คัดลอกมาจาก .env.example)
cp .env.example .env

# 4. รัน Development Server
npm run dev
```
เปิดเบราว์เซอร์ไปที่: `http://localhost:5173`

### 3. การสร้างไฟล์สำหรับ Production (Build)
```bash
npm run build
```
ผลลัพธ์จะอยู่ในโฟลเดอร์ `dist/` พร้อมนำไป Deploy บน Vercel, Netlify หรือ Web Server ใด ๆ

---

## 📁 โครงสร้างโปรเจกต์ (Folder Structure)

```text
smart-dc/
├── src/
│   ├── components/            # คอมโพเนนต์ UI (Layout, SignaturePad, StatusBadge, ฯลฯ)
│   ├── constants/             # ค่าคงที่ (shiftHierarchy, กะการทำงาน)
│   ├── lib/                   # แกนการทำงานหลัก
│   │   ├── database.ts        # Dexie Database Schema & Table Definitions
│   │   ├── businessLogic.ts   # ตรรกะคำนวณ SP, CN, หักน้ำหนักภาชนะ
│   │   ├── supabaseClient.ts  # เชื่อมต่อ Supabase Cloud Database
│   │   ├── syncEngine.ts      # ระบบ Two-way Real-time Sync
│   │   ├── excelImport.ts     # ระบบอ่านและแปลงไฟล์ Excel แผนการรับสินค้า
│   │   ├── googleSheetsSync.ts# ระบบส่งข้อมูลเข้า Google Sheets Webhook
│   │   └── authorizedRoster.json # รายชื่อเจ้าหน้าที่ S&LP และหัวหน้ากะ OTM
│   ├── pages/                 # หน้าจอหลักของแอปพลิเคชัน
│   │   ├── DashboardPage.tsx       # แดชบอร์ดสรุปภาพรวมรายวัน
│   │   ├── AppointmentDetailPage.tsx # หน้าจอสุ่มชั่งสินค้า (Core Weighing UI)
│   │   ├── AppointmentSummaryPage.tsx# หน้ารับรองผล ลงนาม และปิดงาน
│   │   ├── BackOfficePage.tsx      # จัดการ Master Data (Focus, Basket, Users)
│   │   ├── CNTrackingPage.tsx      # ตรวจสอบและติดตามเคสสินค้าตกเกณฑ์ (CN)
│   │   ├── ExcelViewerPage.tsx     # ดูและส่งออกตารางสรุปแบบ Excel
│   │   └── ImportPage.tsx          # หน้านำเข้าไฟล์แผนงานรับสินค้าประจำวัน
│   ├── stores/                # Zustand State Stores (Auth, Session)
│   ├── App.tsx                # Routing Configuration
│   └── main.tsx               # Application Entry Point
├── public/                    # Assets, Manifest และ PWA Icons
├── .env.example               # ตัวอย่าง Environment Variables
├── package.json               # รายการ Dependencies และ Scripts
└── README.md                  # เอกสารแนะนำโปรเจกต์
```

---

## 📞 รายละเอียดการส่งต่องาน (Handover Details)
โปรดอ่านเพิ่มเติมในไฟล์ **`HANDOVER.md`** สำหรับรายละเอียดเชิงลึกเกี่ยวกับตรรกะระบบ, โครงสร้างตารางฐานข้อมูล และข้อเสนอแนะในการพัฒนาต่อยอด
