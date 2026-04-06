import './Header.css';
import { FiChevronRight, FiHome } from 'react-icons/fi';

export default function Header({ breadcrumbs, onBreadcrumbClick }) {
  return (
    <header className="header" role="banner">
      <nav className="breadcrumb" aria-label="File path breadcrumb">
        {/* Home crumb */}
        <button
          className="breadcrumb-item breadcrumb-home"
          onClick={() => onBreadcrumbClick(0)}
          id="breadcrumb-home"
          aria-label="Go to root"
        >
          <FiHome size={14} />
          <span>My Drive</span>
        </button>

        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.id ?? index} className="breadcrumb-segment">
            <FiChevronRight className="breadcrumb-sep" aria-hidden="true" />
            <button
              className={`breadcrumb-item ${index === breadcrumbs.length - 1 ? 'breadcrumb-current' : ''}`}
              onClick={() => onBreadcrumbClick(index + 1)}
              id={`breadcrumb-${index}`}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>
    </header>
  );
}
