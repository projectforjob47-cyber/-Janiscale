// ============================================================
// Shift & Chain of Command Definitions (ระบบกะและสายการบังคับบัญชา)
// Lotus's DC Fresh Receiving
// ============================================================

export interface ShiftInfo {
  id: string;
  name: string;
  timeRange: string;
  icon: string;
  badgeColor: string;
}

export const SHIFT_DEFINITIONS: ShiftInfo[] = [
  {
    id: 'SHIFT_1',
    name: 'กะเช้า',
    timeRange: '06:00 - 14:00 น.',
    icon: '🌅',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    id: 'SHIFT_2',
    name: 'กะบ่าย',
    timeRange: '14:00 - 22:00 น.',
    icon: '☀️',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  {
    id: 'SHIFT_3',
    name: 'กะดึก',
    timeRange: '22:00 - 06:00 น.',
    icon: '🌙',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  {
    id: 'SHIFT_OT_NIGHT',
    name: 'กะ OT กลางคืน',
    timeRange: '18:00 - 06:00 น.',
    icon: '🌌',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  {
    id: 'SHIFT_OT_DAY',
    name: 'กะ OT กลางวัน',
    timeRange: '06:00 - 18:00 น.',
    icon: '🌤️',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    id: 'SHIFT_K',
    name: 'กะ K',
    timeRange: '10:00 - 18:00 น.',
    icon: '🏷️',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
  },
];

export function getDefaultShift(): ShiftInfo {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return SHIFT_DEFINITIONS[0]; // กะเช้า
  if (hour >= 14 && hour < 22) return SHIFT_DEFINITIONS[1]; // กะบ่าย
  return SHIFT_DEFINITIONS[2]; // กะดึก
}

export interface ShiftLeaderPreset {
  empId: string;
  fullName: string;
  role: string;
  department: string;
  defaultSuperior: string;
  defaultSuperiorRole: string;
}

export const SHIFT_LEADERS_PRESETS: ShiftLeaderPreset[] = [
  // DC Operation Team Manager (หัวหน้างานประจำกะ OTM)
  {
    empId: 'S0186095',
    fullName: 'ภาณุพงษ์ จันทร์เพชร',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186114',
    fullName: 'ปิยธิดา รัตนพันธุ์เศรษฐ์',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186127',
    fullName: 'นิ่มนวล มากมี',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186129',
    fullName: 'สาธิต พลับบดี',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186139',
    fullName: 'ภรณ์นรินทร์ พัชรธนาธร',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186157',
    fullName: 'กนกวรรณ เสือถม',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186160',
    fullName: 'เสาวลักษณ์ ปานช่วย',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186165',
    fullName: 'จุธาลักษณ์ สุทธินุ่น',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186167',
    fullName: 'อัจฉรา มิ่งพิจารณ์',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186229',
    fullName: 'สุพิศชา บุญชูวงศ์',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186230',
    fullName: 'ธนากร วันปู',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186233',
    fullName: 'ประภัสสร นิจจันทร์พันศรี',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186238',
    fullName: 'พันทิพา เพ็ชรรัตน์',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186239',
    fullName: 'เบญจมาศ พึ่งไทย',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0186284',
    fullName: 'ปุญชิดา สุขบรรณรัต',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S01S0378',
    fullName: 'เบญจวรรณ คงตุก',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0192786',
    fullName: 'อุรารัตน์ ศรีนิล',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: 'S0196057',
    fullName: 'รัตนวราภรณ์ นวลแก้ว',
    role: 'หัวหน้างาน OTM',
    department: 'DC Operation Team Manager',
    defaultSuperior: 'ยอดชาย ก้าหรีมล๊ะ',
    defaultSuperiorRole: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
];

export interface SuperiorPreset {
  empId?: string;
  fullName: string;
  role: string;
}

export const SUPERIOR_PRESETS: SuperiorPreset[] = [
  {
    empId: 'S0186247',
    fullName: 'ยอดชาย ก้าหรีมล๊ะ',
    role: 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)',
  },
  {
    empId: '704926',
    fullName: 'สุธีร์ บุญโต',
    role: 'DC General Manager (ผู้จัดการทั่วไป DC)',
  },
  {
    empId: 'S0186095',
    fullName: 'ภาณุพงษ์ จันทร์เพชร',
    role: 'DC Operation Team Manager (OTM Lead)',
  },
  {
    empId: 'S0186114',
    fullName: 'ปิยธิดา รัตนพันธุ์เศรษฐ์',
    role: 'DC Operation Team Manager (OTM Lead)',
  },
  {
    empId: 'S0186246',
    fullName: 'ธิติ คงทรัพย์',
    role: 'DC S&LP Team Manager (ผู้จัดการแผนกความปลอดภัย DC S&LP)',
  },
];
