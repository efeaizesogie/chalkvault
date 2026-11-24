import { StrictMode } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './ui/toast';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Start } from './pages/Start';
import { Schools } from './pages/Schools';
import { Join } from './pages/Join';
import { Demo } from './pages/Demo';
import { Workspace } from './school/Workspace';
import { Overview } from './school/Overview';
import { ClassPage } from './school/ClassPage';
import { StudentsPage } from './school/StudentsPage';
import { StudentRecord } from './school/StudentRecord';
import { StaffPage } from './school/StaffPage';
import { SettingsPage } from './school/SettingsPage';
import { ImportPage } from './school/ImportPage';
import { ClassesPage } from './school/ClassesPage';
import { SubjectPage } from './school/SubjectPage';
import { NoticesPage } from './school/NoticesPage';
import { ResultsPage } from './school/Results';
import { Portal } from './pages/Portal';
import { FeesPage } from './modules/FeesPage';
import { AskPage } from './modules/AskPage';
import { MessagesPage } from './modules/MessagesPage';
import { LessonsPage } from './modules/LessonsPage';
import { AdmissionsPage } from './modules/AdmissionsPage';
import { ApplyPage } from './modules/ApplyPage';
import { TimetablePage } from './modules/TimetablePage';
import { LeavePage } from './modules/LeavePage';
import { LibraryPage } from './modules/LibraryPage';
import { TransportPage } from './modules/TransportPage';
import { InventoryPage } from './modules/InventoryPage';
import { AlumniPage } from './modules/AlumniPage';
import './styles.css';
import './platform.css';
import './print.css';
import { registerPwa } from './modules/pwa';

registerPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ToastProvider>
        <AuthProvider>
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/start" element={<Start />} />
            <Route path="/schools" element={<Schools />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/results" element={<Portal />} />
            <Route path="/apply/:schoolId" element={<ApplyPage />} />
            <Route path="/join/:schoolId/:code" element={<Join />} />
            <Route path="/s/:schoolId" element={<Workspace />}>
              <Route index element={<Overview />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="classes/:classId" element={<ClassPage />} />
              <Route path="subjects/:offeringId" element={<SubjectPage />} />
              <Route path="results" element={<ResultsPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="ask" element={<AskPage />} />
              <Route path="fees" element={<FeesPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="lessons" element={<LessonsPage />} />
              <Route path="admissions" element={<AdmissionsPage />} />
              <Route path="timetable" element={<TimetablePage />} />
              <Route path="leave" element={<LeavePage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="transport" element={<TransportPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="alumni" element={<AlumniPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="students/:studentId" element={<StudentRecord />} />
              <Route path="staff" element={<StaffPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="import" element={<ImportPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
