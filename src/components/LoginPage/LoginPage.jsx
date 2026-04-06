import './LoginPage.css';
import { useMsal } from '@azure/msal-react';
import { login } from '../../auth/authService';
import { FiCloud } from 'react-icons/fi';

export default function LoginPage() {
  const { instance } = useMsal();

  const handleLogin = () => login(instance);

  return (
    <div className="login-root">
      {/* Left panel — glassmorphism illustration */}
      <div className="login-left">
        <div className="login-left-content">
          <h1 className="login-left-title">Your files,<br />beautifully organized.</h1>
          <p className="login-left-sub">Browse, navigate and manage your OneDrive from anywhere.</p>
          <div className="login-left-dots">
            <span /><span /><span />
          </div>
        </div>
        <div className="login-left-glow" />
      </div>

      {/* Right panel — sign in card */}
      <div className="login-right">
        <div className="login-card">
          <div className="login-icon-wrap">
            <FiCloud className="login-cloud-icon" />
          </div>

          <h2 className="login-title">OneDrive Explorer</h2>
          <p className="login-subtitle">Access and browse your Microsoft OneDrive files securely.</p>

          <button className="login-btn" onClick={handleLogin} id="btn-sign-in-microsoft">
            <img
              src="https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_mssymbol_19.png"
              alt="Microsoft"
              className="login-ms-logo"
            />
            Sign in with Microsoft
          </button>

          <p className="login-security-note">
            🔒 Your data is encrypted and secure via Microsoft OAuth 2.0
          </p>
        </div>
      </div>
    </div>
  );
}
