// ============================================================
// ระบบรับข้อมูลการสุ่มชั่งและเคส CN จากแอป Lotus's Smart DC
// พร้อมบันทึกรูปลายเซ็นต์ PNG ลง Google Drive (ของบัญชีนี้โดยตรง)
// และส่งเป็น "ลิงก์ไฟล์ภาพลายเซ็นต์จริง" เข้า Google Sheets
// ============================================================

function getSignaturesFolder() {
  // ค้นหาโฟลเดอร์ที่เป็นเจ้าของโดยบัญชีนี้โดยตรง (ป้องกันปัญหาโฟลเดอร์แชร์แบบอ่านอย่างเดียว)
  var ownFolders = DriveApp.searchFolders('title = "SMART_DC_Signatures" and "me" in owners and trashed = false');
  if (ownFolders.hasNext()) {
    return ownFolders.next();
  }
  var own04 = DriveApp.searchFolders('title = "04_Signatures" and "me" in owners and trashed = false');
  if (own04.hasNext()) {
    return own04.next();
  }
  // สร้างโฟลเดอร์ใหม่ใน My Drive ของบัญชีนี้ (มีสิทธิ์เขียน 100%)
  return DriveApp.createFolder("SMART_DC_Signatures");
}

function saveSignatureToDrive(folder, apptNbr, roleKey, signerName, base64DataUrl) {
  if (!base64DataUrl || typeof base64DataUrl !== 'string' || base64DataUrl.indexOf('base64,') === -1) {
    return { url: "", error: "" };
  }
  try {
    var base64 = base64DataUrl.split('base64,')[1];
    var decoded = Utilities.base64Decode(base64);
    var safeAppt = String(apptNbr || 'UNKNOWN').replace(/[^a-zA-Z0-9_-]/g, '');
    var fileName = "SIG_" + safeAppt + "_" + roleKey + "_" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss") + ".png";
    
    var blob = Utilities.newBlob(decoded, "image/png", fileName);
    var file;
    try {
      file = folder.createFile(blob);
    } catch (folderErr) {
      // Fallback: บันทึกลง My Drive หลักโดยตรงหากโฟลเดอร์มีปัญหา
      file = DriveApp.createFile(blob);
    }
    
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}
    
    return { url: file.getUrl(), error: "" };
  } catch (err) {
    return { url: "", error: "ERR: " + err.toString() };
  }
}

function ensureColumnHeader(sheet, colIndex, headerText, bgColor) {
  if (sheet.getLastColumn() < colIndex || sheet.getRange(1, colIndex).getValue() !== headerText) {
    sheet.getRange(1, colIndex)
      .setValue(headerText)
      .setBackground(bgColor)
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // แท็บที่ 1: บันทึกการสุ่มชั่งสดทุกรายการ
    var sheetName = "📊 บันทึกการสุ่มชั่งสด";
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow([
        "วัน-เวลาบันทึก", "ใบนัดหมาย", "เลขที่ PO", "ผู้ขาย", "สายส่ง/รถ", "คนขับรถ",
        "รหัสสินค้า", "ชื่อสินค้า", "ชนิดตะกร้า", "จำนวนตะกร้าที่มา", "จำนวนสุ่มชั่ง",
        "นน.รวมชั่ง (kg)", "นน.หักตะกร้า (kg)", "เกณฑ์มาตรฐาน (kg)", "นน.สุทธิเฉลี่ยจริง (kg)",
        "ผลต่าง/กล่อง (kg)", "สถานะการชั่ง", "เคส CN", "ยอด นน.ขาด (CN kg)", "พนักงานตรวจรับ", "ผู้จัดการ OTM",
        "ภาพลายเซ็นต์ผู้ขาย (Vendor)", "ภาพลายเซ็นต์ตรวจรับ (Receive)", "ภาพลายเซ็นต์ LP&S"
      ]);
      sheet.getRange(1, 1, 1, 24).setBackground("#0284C7").setFontColor("#FFFFFF").setFontWeight("bold");
      sheet.setFrozenRows(1);
    } else {
      ensureColumnHeader(sheet, 22, "ภาพลายเซ็นต์ผู้ขาย (Vendor)", "#0284C7");
      ensureColumnHeader(sheet, 23, "ภาพลายเซ็นต์ตรวจรับ (Receive)", "#0284C7");
      ensureColumnHeader(sheet, 24, "ภาพลายเซ็นต์ LP&S", "#0284C7");
    }

    // แท็บที่ 2: เฉพาะเคสขอเปิด CN
    var cnSheetName = "🚨 รายการขอเปิด_CN";
    var cnSheet = ss.getSheetByName(cnSheetName);
    if (!cnSheet) {
      cnSheet = ss.insertSheet(cnSheetName);
      cnSheet.appendRow([
        "วัน-เวลาบันทึก", "ใบนัดหมาย", "เลขที่ PO", "ผู้ขาย", "รหัสสินค้า", "ชื่อสินค้า",
        "จำนวนตะกร้ากระทบ", "เกณฑ์ (kg)", "นน.เฉลี่ยจริง (kg)", "ผลต่าง/กล่อง (kg)",
        "ยอด นน.ขอเปิด CN รวม (kg)", "พนักงานตรวจรับ", "ผู้จัดการ OTM",
        "ภาพลายเซ็นต์ผู้ขาย (Vendor)", "ภาพลายเซ็นต์ตรวจรับ (Receive)", "ภาพลายเซ็นต์ LP&S"
      ]);
      cnSheet.getRange(1, 1, 1, 16).setBackground("#E11D48").setFontColor("#FFFFFF").setFontWeight("bold");
      cnSheet.setFrozenRows(1);
    } else {
      ensureColumnHeader(cnSheet, 14, "ภาพลายเซ็นต์ผู้ขาย (Vendor)", "#E11D48");
      ensureColumnHeader(cnSheet, 15, "ภาพลายเซ็นต์ตรวจรับ (Receive)", "#E11D48");
      ensureColumnHeader(cnSheet, 16, "ภาพลายเซ็นต์ LP&S", "#E11D48");
    }

    // บันทึกรูปลายเซ็นต์ PNG ลง Google Drive
    var vendorRes = { url: "", error: "" };
    var receiveRes = { url: "", error: "" };
    var lpsRes = { url: "", error: "" };

    if (data.signatures) {
      var sigFolder = getSignaturesFolder();
      if (data.signatures.vendor) {
        vendorRes = saveSignatureToDrive(sigFolder, data.apptNbr, "VENDOR", data.signatures.vendorName, data.signatures.vendor);
      }
      if (data.signatures.receive) {
        receiveRes = saveSignatureToDrive(sigFolder, data.apptNbr, "RECEIVE", data.signatures.receiveName, data.signatures.receive);
      }
      if (data.signatures.lps) {
        lpsRes = saveSignatureToDrive(sigFolder, data.apptNbr, "LPS", data.signatures.lpsName, data.signatures.lps);
      }
    }

    var vendorCell = vendorRes.url ? '=HYPERLINK("' + vendorRes.url + '", "🖼️ ดูภาพลายเซ็นต์ Vendor")' : (vendorRes.error || "-");
    var receiveCell = receiveRes.url ? '=HYPERLINK("' + receiveRes.url + '", "🖼️ ดูภาพลายเซ็นต์ Receive")' : (receiveRes.error || "-");
    var lpsCell = lpsRes.url ? '=HYPERLINK("' + lpsRes.url + '", "🖼️ ดูภาพลายเซ็นต์ LP&S")' : (lpsRes.error || "-");

    if (data.rows && data.rows.length > 0) {
      for (var i = 0; i < data.rows.length; i++) {
        var r = data.rows[i];

        sheet.appendRow([
          r.timestamp, r.apptNbr, r.poNbr, r.vendorName, r.carrierCode, r.driverName,
          r.itemId, r.description, r.containerType, r.totalBaskets, r.sampleCount,
          r.totalGrossKg, r.totalTareKg, r.stdWeightKg, r.avgNetWeightKg,
          r.diffPerBasketKg, r.samplingStatus, r.isCN, r.cnTotalKg, r.staffName, r.otmName,
          vendorCell, receiveCell, lpsCell
        ]);

        if ((r.isCN && r.isCN.indexOf("ใช่") !== -1) || r.cnTotalKg > 0) {
          cnSheet.appendRow([
            r.timestamp, r.apptNbr, r.poNbr, r.vendorName, r.itemId, r.description,
            r.totalBaskets, r.stdWeightKg, r.avgNetWeightKg, r.diffPerBasketKg,
            r.cnTotalKg, r.staffName, r.otmName,
            vendorCell, receiveCell, lpsCell
          ]);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: data.rows ? data.rows.length : 0,
      vendorUrl: vendorRes.url,
      receiveUrl: receiveRes.url,
      lpsUrl: lpsRes.url
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันสำหรับกด Run เพื่อขอสิทธิ์ Google Drive (สร้าง/อัปโหลดไฟล์) ให้สมบูรณ์
function testDriveWritePermission() {
  var folder = getSignaturesFolder();
  var testBlob = Utilities.newBlob("smart-dc-drive-test", "text/plain", "_test_permission.txt");
  var file = folder.createFile(testBlob);
  file.setTrashed(true);
  Logger.log("SUCCESS: มีสิทธิ์เขียน Google Drive ลงโฟลเดอร์ " + folder.getName() + " เรียบร้อยแล้ว!");
}
