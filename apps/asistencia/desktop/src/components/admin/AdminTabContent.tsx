import React, { Suspense, lazy } from 'react';
import { AttendanceRecord, DeviceConfig, SyncLogEntry, Terminal, User, UserRole } from '../../types';
import { API_BASE } from '../../utils/api';
import { ToastType, AttendanceMarkRecord, AttendanceManualMarkPayload } from '@infounsa/shared-types';

const DashboardTab = lazy(() => import('../dashboard/DashboardTab'));
const KioskTab = lazy(() => import('../kiosk/KioskTab'));
const LogTab = lazy(() => import('../log/LogTab'));
const ReportsTab = lazy(() => import('../reports/ReportsTab'));
const SettingsTab = lazy(() => import('../settings/SettingsTab'));
const SyncTab = lazy(() => import('../sync/SyncTab'));
const OperatorsTab = lazy(() => import('../settings/OperatorsTab'));
const BatchUploadTab = lazy(() => import('./BatchUploadTab'));

export type ActiveTab = 'dashboard' | 'kiosk' | 'log' | 'sync' | 'reports' | 'settings' | 'operators' | 'upload';

interface AdminTabContentProps {
  activeTab: ActiveTab;
  userRole: UserRole | null;
  records: AttendanceRecord[];
  syncQueue: AttendanceRecord[];
  syncLogs: SyncLogEntry[];
  isOnline: boolean;
  isLoading: boolean;
  dniInput: string;
  setDniInput: (value: string) => void;
  handleDniSubmit: (e: React.FormEvent) => void;
  filterDni: string;
  setFilterDni: (value: string) => void;
  filterDate: string;
  setFilterDate: (value: string) => void;
  filteredRecords: AttendanceRecord[];
  users: User[];
  setActiveTab: (tab: ActiveTab) => void;
  handleSyncNow: () => void;
  reportStart: string;
  setReportStart: (value: string) => void;
  reportEnd: string;
  setReportEnd: (value: string) => void;
  reportFormat: 'semanal' | 'detallado' | 'resumido';
  setReportFormat: (value: 'semanal' | 'detallado' | 'resumido') => void;
  handleGenerateReport: () => void;
  handleGenerateExcel: () => void;
  isExcelLoading: boolean;
  handleGenerateAuditReport: () => void;
  isAuditLoading: boolean;
  reportUrl: string | null;
  profileName: string;
  setProfileName: (value: string) => void;
  profileLastName: string;
  setProfileLastName: (value: string) => void;
  profileEmail: string;
  setProfileEmail: (value: string) => void;
  notifyAttendance: boolean;
  setNotifyAttendance: (value: boolean) => void;
  notifyTerminal: boolean;
  setNotifyTerminal: (value: boolean) => void;
  notifyReports: boolean;
  setNotifyReports: (value: boolean) => void;
  terminals: Terminal[];
  handleAddTerminal?: () => void;
  handleLogout: () => void;
  showToast: (msg: string, type: ToastType) => void;
  deviceConfig: DeviceConfig;
  handleSaveDeviceConfig: (config: DeviceConfig) => Promise<void>;
  handleResetLocalData: () => void;
  scannedUserCard: AttendanceRecord | null;
  handleUpdateMark: (localId: string, fields: Partial<AttendanceMarkRecord>) => Promise<void>;
  handleDeleteMark: (localId: string) => Promise<void>;
  handleCreateManualMark: (payload: AttendanceManualMarkPayload) => Promise<void>;
}

function LoadingPanel() {
  return <div className="panel-loading">Cargando vista…</div>;
}

export default function AdminTabContent(props: AdminTabContentProps) {
  const {
    activeTab,
    userRole,
    records,
    syncQueue,
    syncLogs,
    isOnline,
    isLoading,
    dniInput,
    setDniInput,
    handleDniSubmit,
    filterDni,
    setFilterDni,
    filterDate,
    setFilterDate,
    filteredRecords,
    users,
    setActiveTab,
    handleSyncNow,
    reportStart,
    setReportStart,
    reportEnd,
    setReportEnd,
    reportFormat,
    setReportFormat,
    handleGenerateReport,
    handleGenerateExcel,
    isExcelLoading,
    reportUrl,
    profileName,
    setProfileName,
    profileLastName,
    setProfileLastName,
    profileEmail,
    setProfileEmail,
    notifyAttendance,
    setNotifyAttendance,
    notifyTerminal,
    setNotifyTerminal,
    notifyReports,
    setNotifyReports,
    terminals,
    handleAddTerminal,
    handleLogout,
    showToast,
    deviceConfig,
    handleSaveDeviceConfig,
    handleResetLocalData,
    scannedUserCard,
  } = props;

  return (
    <Suspense fallback={<LoadingPanel />}>
      {activeTab === 'dashboard' && (
        <DashboardTab
          userRole={userRole}
          records={records}
          syncQueue={syncQueue}
          isOnline={isOnline}
          setActiveTab={setActiveTab}
        />
      )}

      {activeTab === 'kiosk' && (
        <KioskTab
          dniInput={dniInput}
          setDniInput={setDniInput}
          handleDniSubmit={handleDniSubmit}
          isLoading={isLoading}
          records={records}
          syncQueue={syncQueue}
          scannedUserCard={scannedUserCard}
          profileName={profileName}
          profileLastName={profileLastName}
        />
      )}

      {activeTab === 'log' && (
        <LogTab
          filterDni={filterDni}
          setFilterDni={setFilterDni}
          filterDate={filterDate}
          setFilterDate={setFilterDate}
          isLoading={isLoading}
          records={records}
          filteredRecords={filteredRecords}
          users={users}
          userRole={userRole || ''}
          isOnline={isOnline}
          deviceConfig={deviceConfig}
          onUpdateMark={props.handleUpdateMark}
          onDeleteMark={props.handleDeleteMark}
          onCreateManualMark={props.handleCreateManualMark}
          showToast={showToast}
        />
      )}

      {activeTab === 'sync' && (
        <SyncTab
          syncQueue={syncQueue}
          handleSyncNow={handleSyncNow}
          isLoading={isLoading}
          syncLogs={syncLogs}
        />
      )}

      {activeTab === 'reports' && (
        <ReportsTab
          reportStart={reportStart}
          setReportStart={setReportStart}
          reportEnd={reportEnd}
          setReportEnd={setReportEnd}
          handleGenerateReport={handleGenerateReport}
          handleGenerateExcel={handleGenerateExcel}
          isLoading={isLoading}
          isExcelLoading={isExcelLoading}
          handleGenerateAuditReport={props.handleGenerateAuditReport}
          isAuditLoading={props.isAuditLoading}
          userRole={userRole || ''}
          isOnline={isOnline}
          reportUrl={reportUrl}
          records={records}
          reportFormat={reportFormat}
          setReportFormat={setReportFormat}
        />
      )}

      {activeTab === 'upload' && (
        <BatchUploadTab
          activeApiBase={deviceConfig.api_base_url || API_BASE}
          showToast={showToast}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsTab
          userRole={userRole}
          profileName={profileName}
          setProfileName={setProfileName}
          profileLastName={profileLastName}
          setProfileLastName={setProfileLastName}
          profileEmail={profileEmail}
          setProfileEmail={setProfileEmail}
          notifyAttendance={notifyAttendance}
          setNotifyAttendance={setNotifyAttendance}
          notifyTerminal={notifyTerminal}
          setNotifyTerminal={setNotifyTerminal}
          notifyReports={notifyReports}
          setNotifyReports={setNotifyReports}
          terminals={terminals}
          handleAddTerminal={handleAddTerminal}
          users={users}
          handleLogout={handleLogout}
          showToast={showToast}
          deviceConfig={deviceConfig}
          pendingSyncCount={syncQueue.length}
          onSaveDeviceConfig={handleSaveDeviceConfig}
          onResetLocalData={handleResetLocalData}
        />
      )}

      {activeTab === 'operators' && (
        <OperatorsTab
          showToast={showToast}
          userRole={userRole}
          users={users}
        />
      )}
    </Suspense>
  );
}
