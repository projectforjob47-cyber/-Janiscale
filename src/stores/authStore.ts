// ============================================================
// SMART DC — Auth Store (Zustand)
// V3.0 Production Authentication:
// 1. Admin: Google Login (projectforjob47@gmail.com)
// 2. Receive: Employee ID + personal 6-digit PIN
// 3. OTM: Employee ID + personal 6-digit PIN
// 4. LP&S: Selected from authorized roster for signatures
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '../types';
import { db } from '../lib/database';
import authorizedRoster from '../lib/authorizedRoster.json';
import { lookupServerUser, setServerUserPin } from '../lib/syncEngine';

export const ADMIN_ALLOWLIST = [
  'projectforjob47@gmail.com',
  'guidelump@gmail.com',
  'srrdc_inbound@lotuss.com',
  'piromya_sedtacher@lotuss.com',
  'sahaphop.thammakad@lotuss.com',
  'benjawan.kongtuk1@lotuss.com',
];

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  loginWithPin: (empId: string, pin: string) => Promise<{ success: boolean; message?: string }>;
  loginWithGoogle: (email: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  setOnboardingPin: (empId: string, newPin: string, fullNameForNewUser?: string) => Promise<{ success: boolean; message?: string; user?: User }>;
  registerSupportUser: (empId: string, fullName: string, pin: string) => Promise<{ success: boolean; message?: string; user?: User }>;
  resetForgottenPin: (empId: string, newPin: string, fullNameVerify?: string) => Promise<{ success: boolean; message?: string; user?: User }>;
  logout: () => void;
  hasRole: (role: UserRole | UserRole[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,

      // Employee ID + 6-digit PIN Login (Receive and OTM)
      loginWithPin: async (empId: string, pin: string) => {
        // Enforce: uppercase, alphanumeric only, no spaces
        const cleanEmpId = empId.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cleanPin = pin.trim();

        if (!cleanEmpId) {
          return { success: false, message: 'กรุณากรอกรหัสพนักงาน' };
        }

        if (cleanPin.length !== 6 || !/^\d{6}$/.test(cleanPin)) {
          return { success: false, message: 'รหัส PIN ต้องเป็นตัวเลข 6 หลัก' };
        }

        // Query user from IndexedDB
        let user = await db.users
          .where('empId')
          .equals(cleanEmpId)
          .first();

        // Case-insensitive lookup fallback
        if (!user) {
          user = await db.users.filter(u => Boolean(u.empId && u.empId.toUpperCase() === cleanEmpId)).first();
        }

        // Real-Time Multi-Device Sync: If user not set locally, check central server!
        if (!user || !user.isPinSet) {
          const serverUser = await lookupServerUser(cleanEmpId);
          if (serverUser && serverUser.isPinSet) {
            user = serverUser;
          }
        }

        // Check authorized roster for real-time sync
        const rosterItem = authorizedRoster.find(
          r => r.empId.trim().toUpperCase() === cleanEmpId
        );

        if (!user && rosterItem) {
          // Found in authorized roster! Seed into IndexedDB immediately
          // Requirement 5: ผู้มีสิทธิ์อนุมัติ OTM ต้องอยู่ในแผนก DC Operation Team Manager ใน Employee Master ที่ผ่านการตรวจสอบแล้วเท่านั้น
          const isOtm = rosterItem.department === 'DC Operation Team Manager';
          const role: UserRole = isOtm ? 'OTM' : (rosterItem.department.includes('S&LP') ? 'LPS' : 'RECEIVE');
          
          const newUser: User = {
            id: `user-${rosterItem.empId}`,
            username: rosterItem.empId,
            empId: rosterItem.empId,
            fullName: rosterItem.fullName,
            role,
            department: rosterItem.department,
            email: rosterItem.email,
            pinHash: '',
            isPinSet: false,
            isActive: true,
            createdAt: new Date().toISOString()
          };
          await db.users.put(newUser);

          return {
            success: false,
            message: `สวัสดีคุณ ${rosterItem.fullName} ท่านยังไม่ได้ตั้งรหัส PIN ส่วนตัว กรุณากด "สำหรับพนักงาน SRRDC ที่เข้าใช้งานครั้งแรก" เพื่อตั้งรหัส PIN 6 หลัก`
          };
        }

        if (!user) {
          return { success: false, message: 'ไม่พบรหัสพนักงานนี้ในระบบ กรุณากด "สำหรับพนักงาน SRRDC ที่เข้าใช้งานครั้งแรก" เพื่อเริ่มลงทะเบียน' };
        }

        // Sync department and role dynamically from Employee Master
        if (rosterItem) {
          const isOtm = rosterItem.department === 'DC Operation Team Manager';
          const expectedRole: UserRole = isOtm ? 'OTM' : (rosterItem.department.includes('S&LP') ? 'LPS' : 'RECEIVE');
          if (user.role !== expectedRole || user.department !== rosterItem.department) {
            user.role = expectedRole;
            user.department = rosterItem.department;
            await db.users.update(user.id, { role: expectedRole, department: rosterItem.department });
          }
        }

        if (!user.isActive) {
          return { success: false, message: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
        }

        // Check if user has set their personal PIN
        if (!user.isPinSet || !user.pinHash) {
          return { 
            success: false, 
            message: `สวัสดีคุณ ${user.fullName} ท่านยังไม่ได้ตั้งรหัส PIN ส่วนตัว กรุณากด "สำหรับพนักงาน SRRDC ที่เข้าใช้งานครั้งแรก" เพื่อตั้งรหัส 6 หลัก` 
          };
        }

        if (user.pinHash !== cleanPin) {
          return { success: false, message: 'รหัส PIN 6 หลักไม่ถูกต้อง' };
        }

        set({ currentUser: user, isAuthenticated: true });
        return { success: true };
      },

      // Google Login for Admin (Exclusive System Owner: projectforjob47@gmail.com with password: Forwork2547)
      loginWithGoogle: async (email: string, password?: string) => {
        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password?.trim() || '';

        // Check against Admin Allowlist
        if (!ADMIN_ALLOWLIST.includes(cleanEmail)) {
          return { success: false, message: 'บัญชี Google นี้ไม่ได้รับสิทธิ์ผู้ดูแลระบบ (Unauthorized Admin Account)' };
        }

        if (!cleanPassword) {
          return { success: false, message: 'กรุณากรอกรหัสผ่านความปลอดภัยของผู้ดูแลระบบ' };
        }

        // Strictly verify password Forwork2547
        if (cleanPassword !== 'Forwork2547') {
          return { success: false, message: 'รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง' };
        }

        // Find or create admin user in IndexedDB
        let adminUser = await db.users
          .where('username')
          .equals(cleanEmail)
          .first();

        if (!adminUser) {
          const defaultName = cleanEmail.includes('benjawan')
            ? 'Benjawan Kongtuk (Inbound Admin)'
            : cleanEmail.includes('sahaphop')
            ? 'Sahaphop Thammakad (Inbound Admin)'
            : cleanEmail.includes('piromya')
            ? 'Piromya Sedtacher (Inbound Admin)'
            : cleanEmail.includes('srrdc_inbound')
            ? 'SRRDC Inbound Admin'
            : cleanEmail.includes('guidelump')
            ? 'System Administrator (guidelump@gmail.com)'
            : 'System Administrator (Owner)';

          const defaultEmpId = cleanEmail.includes('benjawan')
            ? 'ADM_BENJAWAN'
            : cleanEmail.includes('sahaphop')
            ? 'ADM_SAHAPHOP'
            : cleanEmail.includes('piromya')
            ? 'ADM_PIROMYA'
            : cleanEmail.includes('srrdc_inbound')
            ? 'ADM_INBOUND'
            : cleanEmail.includes('guidelump')
            ? 'ADM_GUIDELUMP'
            : 'ADMIN01';

          adminUser = {
            id: `admin-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
            username: cleanEmail,
            empId: defaultEmpId,
            fullName: defaultName,
            role: 'ADMIN',
            email: cleanEmail,
            pinHash: 'Forwork2547',
            isActive: true,
            createdAt: new Date().toISOString()
          };
          await db.users.put(adminUser);
        } else {
          await db.users.update(adminUser.id, {
            pinHash: 'Forwork2547',
            role: 'ADMIN',
            isActive: true
          });
          adminUser.role = 'ADMIN';
        }

        set({ currentUser: adminUser, isAuthenticated: true });
        return { success: true };
      },

      // First-time PIN setup / Unified Onboarding (Single Registration Pathway)
      setOnboardingPin: async (empId: string, newPin: string, fullNameForNewUser?: string) => {
        const cleanEmpId = empId.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cleanNewPin = newPin.trim();

        if (!cleanEmpId) {
          return { success: false, message: 'กรุณาระบุรหัสพนักงาน' };
        }

        if (cleanNewPin.length !== 6 || !/^\d{6}$/.test(cleanNewPin)) {
          return { success: false, message: 'รหัส PIN ต้องเป็นตัวเลข 6 หลัก' };
        }

        let user = await db.users.where('empId').equals(cleanEmpId).first();
        if (!user) {
          user = await db.users.filter(u => Boolean(u.empId && u.empId.toUpperCase() === cleanEmpId)).first();
        }

        // Check if employee exists in official Employee Master
        const rosterItem = authorizedRoster.find(
          r => r.empId.trim().toUpperCase() === cleanEmpId
        );

        if (rosterItem) {
          // ── Case 1: Employee in Master ──
          // Requirement 5: ผู้มีสิทธิ์อนุมัติ OTM ต้องอยู่ในแผนก DC Operation Team Manager
          const isOtm = rosterItem.department === 'DC Operation Team Manager';
          const role: UserRole = isOtm ? 'OTM' : (rosterItem.department.includes('S&LP') ? 'LPS' : 'RECEIVE');

          if (!user) {
            user = {
              id: `user-${rosterItem.empId}`,
              username: rosterItem.empId,
              empId: rosterItem.empId,
              fullName: rosterItem.fullName,
              role,
              department: rosterItem.department,
              email: rosterItem.email,
              pinHash: cleanNewPin,
              isPinSet: true,
              isActive: true,
              createdAt: new Date().toISOString()
            };
            await db.users.put(user);
          } else {
            await db.users.update(user.id, {
              pinHash: cleanNewPin,
              isPinSet: true,
              role,
              department: rosterItem.department,
              fullName: rosterItem.fullName,
              isActive: true
            });
            user = { ...user, pinHash: cleanNewPin, isPinSet: true, role, department: rosterItem.department, fullName: rosterItem.fullName };
          }
        } else {
          // ── Case 2: New Employee not yet in Master ──
          // Requirement 4: พนักงานใหม่ที่ยังไม่อยู่ใน Master สามารถยื่นลงทะเบียนได้ แต่ต้องผ่านการยืนยันตัวตนและตรวจสอบข้อมูลก่อนเปิดสิทธิ์ปฏิบัติงาน
          const cleanName = fullNameForNewUser?.trim();
          if (!cleanName) {
            return {
              success: false,
              message: 'ไม่พบรหัสในฐานข้อมูลทำเนียบ กรุณาระบุชื่อ-นามสกุลเพื่อยื่นลงทะเบียน'
            };
          }

          if (!user) {
            user = {
              id: `user-${cleanEmpId}`,
              username: cleanEmpId,
              empId: cleanEmpId,
              fullName: cleanName,
              role: 'RECEIVE',
              department: 'พนักงานใหม่ (SRRDC)',
              pinHash: cleanNewPin,
              isPinSet: true,
              isActive: true,
              createdAt: new Date().toISOString()
            };
            await db.users.put(user);
          } else {
            await db.users.update(user.id, {
              pinHash: cleanNewPin,
              isPinSet: true,
              fullName: cleanName,
              isActive: true
            });
            user = { ...user, pinHash: cleanNewPin, isPinSet: true, fullName: cleanName };
          }
        }

        set({ currentUser: user, isAuthenticated: true });

        // Sync new PIN immediately to Central Server so other devices recognize it in real time
        setServerUserPin(cleanEmpId, cleanNewPin, user.fullName, user.role, user.department).catch(console.error);

        return { 
          success: true, 
          message: `ตั้งรหัส PIN สำเร็จแล้ว ยินดีต้อนรับคุณ ${user.fullName}`,
          user: user 
        };
      },

      // Register temporary / external Support staff (Unified with setOnboardingPin)
      registerSupportUser: async (empId: string, fullName: string, pin: string) => {
        return get().setOnboardingPin(empId, pin, fullName);
      },

      // Reset forgotten PIN
      resetForgottenPin: async (empId: string, newPin: string, fullNameVerify?: string) => {
        const cleanEmpId = empId.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cleanNewPin = newPin.trim();
        const cleanVerify = fullNameVerify?.trim() || '';

        if (!cleanEmpId) {
          return { success: false, message: 'กรุณาระบุรหัสพนักงาน' };
        }
        if (cleanNewPin.length !== 6 || !/^\d{6}$/.test(cleanNewPin)) {
          return { success: false, message: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 6 หลัก' };
        }

        let user = await db.users.where('empId').equals(cleanEmpId).first();
        if (!user) {
          user = await db.users.filter(u => Boolean(u.empId && u.empId.toUpperCase() === cleanEmpId)).first();
        }

        if (!user) {
          // Fallback to authorizedRoster
          const rosterItem = authorizedRoster.find(
            r => r.empId.trim().toUpperCase() === cleanEmpId
          );
          if (!rosterItem) {
            return { success: false, message: 'ไม่พบรหัสพนักงานนี้ในระบบ' };
          }

          const isOtm = rosterItem.department === 'DC Operation Team Manager';
          const role: UserRole = isOtm ? 'OTM' : (rosterItem.department.includes('S&LP') ? 'LPS' : 'RECEIVE');

          user = {
            id: `user-${rosterItem.empId}`,
            username: rosterItem.empId,
            empId: rosterItem.empId,
            fullName: rosterItem.fullName,
            role,
            department: rosterItem.department,
            email: rosterItem.email,
            pinHash: cleanNewPin,
            isPinSet: true,
            isActive: true,
            createdAt: new Date().toISOString()
          };
          await db.users.put(user);
        } else {
          // Verify name if provided
          if (cleanVerify) {
            const userBaseName = user.fullName.replace(/\s*\(ซัพพอร์ต\)\s*/g, '').trim().toLowerCase();
            const verifyName = cleanVerify.replace(/\s*\(ซัพพอร์ต\)\s*/g, '').trim().toLowerCase();
            if (!userBaseName.includes(verifyName) && !verifyName.includes(userBaseName)) {
              return { success: false, message: 'ชื่อที่ระบุไม่ตรงกับข้อมูลในระบบ กรุณาตรวจสอบอีกครั้ง' };
            }
          }

          await db.users.update(user.id, {
            pinHash: cleanNewPin,
            isPinSet: true
          });
          user = { ...user, pinHash: cleanNewPin, isPinSet: true };
        }

        set({ currentUser: user, isAuthenticated: true });

        // Sync recovered PIN immediately to Central Server so other devices recognize it in real time
        setServerUserPin(cleanEmpId, cleanNewPin, user.fullName, user.role, user.department).catch(console.error);

        return {
          success: true,
          message: `กู้คืนรหัส PIN สำเร็จแล้ว ยินดีต้อนรับคุณ ${user.fullName}`,
          user: user
        };
      },

      logout: () => {
        set({ currentUser: null, isAuthenticated: false });
      },

      hasRole: (role: UserRole | UserRole[]): boolean => {
        const user = get().currentUser;
        if (!user || !user.isActive) return false;

        // Admin has superuser access
        if (user.role === 'ADMIN') return true;

        // Requirement 5: ผู้มีสิทธิ์อนุมัติ OTM ต้องอยู่ในแผนก DC Operation Team Manager ใน Employee Master ที่ผ่านการตรวจสอบแล้วเท่านั้น
        const isOtmDept = user.department === 'DC Operation Team Manager';

        if (Array.isArray(role)) {
          if (role.includes('OTM') && !isOtmDept) {
            // Check if user has other allowed roles
            const otherRoles = role.filter(r => r !== 'OTM') as UserRole[];
            if (otherRoles.length === 0) return false;
            return otherRoles.includes(user.role);
          }
          if (user.role === 'SUPPORT' && role.includes('RECEIVE')) return true;
          return role.includes(user.role);
        }

        if (role === 'OTM') {
          return isOtmDept;
        }

        if (user.role === 'SUPPORT' && role === 'RECEIVE') return true;
        return user.role === role;
      },
    }),
    {
      name: 'smart-dc-auth-v3',
      partialize: (state) => ({ currentUser: state.currentUser, isAuthenticated: state.isAuthenticated }),
    }
  )
);
