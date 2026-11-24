import { StrictMode } from 'react';
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
import { ClassesPage } from './school/ClassesPage';
import { SubjectPage } from './school/SubjectPage';
import { NoticesPage } from './school/NoticesPage';
import { ResultsPage } from './school/Results';
import { Portal } from './pages/Portal';
import './styles.css';
import './platform.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/start" element={<Start />} />
            <Route path="/schools" element={<Schools />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/results" element={<Portal />} />
            <Route path="/join/:schoolId/:code" element={<Join />} />
            <Route path="/s/:schoolId" element={<Workspace />}>
              <Route index element={<Overview />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="classes/:classId" element={<ClassPage />} />
              <Route path="subjects/:offeringId" element={<SubjectPage />} />
              <Route path="results" element={<ResultsPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="students/:studentId" element={<StudentRecord />} />
              <Route path="staff" element={<StaffPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
