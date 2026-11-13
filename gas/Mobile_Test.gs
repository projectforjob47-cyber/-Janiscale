/**
 * SMART DC — Google Apps Script Backend (Mobile Test & Operations API)
 * Spreadsheet ID: 1jhNou39UiAbfYTnRqTLDAF_rI14BThwAUMA_H12RCZw
 * Drive Folder ID: 17E0KXEV23g8IiOliclyB_P1zL_57_1dE
 */

const CONFIG = {
  SPREADSHEET_ID: '1jhNou39UiAbfYTnRqTLDAF_rI14BThwAUMA_H12RCZw',
  ROSTER_SHEET_ID: '1ih0Lvgw9VnrYBoPA3NT-RltH44UCzRzcGF5sB3Ht57A',
  DRIVE_FOLDERS: {
    ROOT: '17E0KXEV23g8IiOliclyB_P1zL_57_1dE',
    APPT_IMPORTS: '01_Appointment_Imports',
    FOCUS_WEEKLY: '02_Focus_Weekly',
    WEIGHT_PHOTOS: '03_Weight_Photos',
    SIGNATURES: '04_Signatures',
    REPORTS: '05_Reports_Exports',
    ARCHIVE: '06_Archive',
    CONFIG: '07_System_Config'
  }
};

/**
 * Serves the Mobile Test Web App HTML or JSON API
 */
function doGet(e) {
  // Check if API request via query parameter
  if (e && e.parameter && e.parameter.action) {
    return handleApiGet(e);
  }

  // Default: Serve Mobile_Test_Page.html
  try {
    const template = HtmlService.createTemplateFromFile('Mobile_Test_Page');
    return template.evaluate()
      .setTitle('SMART DC — Mobile Test')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    // Fallback if HTML file is not found
    return HtmlService.createHtmlOutput(
      '<h3>SMART DC Mobile Test Backend Ready</h3><p>Status: OK</p><p>Error loading Mobile_Test_Page: ' + err.message + '</p>'
    );
  }
}

/**
 * Handles incoming POST requests (API endpoints)
 */
function doPost(e) {
  try {
    let payload = {};
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action || (e.parameter ? e.parameter.action : '');
    let result = { success: false, message: 'Unknown action' };

    if (action === 'saveMobileDemo' || action === 'DEMO_ENTRY') {
      result = saveMobileDemo(payload.data || payload);
    } else if (action === 'readMobileDemoCount') {
      result = readMobileDemoCount();
    } else if (action === 'syncSamplingRecord') {
      result = syncSamplingRecord(payload.record);
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleApiGet(e) {
  const action = e.parameter.action;
  let result = { success: false };

  if (action === 'readMobileDemoCount') {
    result = readMobileDemoCount();
  } else if (action === 'ping') {
    result = { success: true, timestamp: new Date().toISOString(), message: 'SMART DC GAS API Online' };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Saves test records to DEMO_Entries tab
 */
function saveMobileDemo(data) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = ss.getSheetByName('DEMO_Entries');
    
    if (!sheet) {
      sheet = ss.insertSheet('DEMO_Entries');
      sheet.appendRow([
        'Timestamp', 
        'Device_User', 
        'Role', 
        'Appointment_Nbr', 
        'PO_Nbr', 
        'Item_ID', 
        'Actual_Qty', 
        'Sample_Count', 
        'Total_Gross', 
        'Total_Net', 
        'Tolerance_Result', 
        'Signatures_Completed',
        'Raw_JSON'
      ]);
    }

    const timestamp = new Date();
    const row = [
      timestamp,
      data.deviceUser || data.userName || 'Tester',
      data.role || 'RECEIVE',
      data.apptNbr || '',
      data.poNbr || '',
      data.itemId || '',
      data.actualQty || 0,
      data.sampleCount || 0,
      data.totalGross || 0,
      data.totalNet || 0,
      data.toleranceResult || '',
      data.signaturesCompleted || '',
      JSON.stringify(data)
    ];

    sheet.appendRow(row);

    return {
      success: true,
      timestamp: timestamp.toISOString(),
      rowAppended: sheet.getLastRow(),
      message: 'บันทึกข้อมูลทดสอบลงใน DEMO_Entries เรียบร้อยแล้ว'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Reads demo count from DEMO_Entries
 */
function readMobileDemoCount() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName('DEMO_Entries');
    if (!sheet) {
      return { success: true, count: 0 };
    }
    const lastRow = sheet.getLastRow();
    return {
      success: true,
      count: Math.max(0, lastRow - 1)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
