import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { RmeEmployeeView } from '../components/RmeEmployeeView';
import type { TeamMember } from '../types';
import './EmployeeRme.css';

interface EmployeeRmeProps {
  user: TeamMember;
}

export function EmployeeRme({ user }: EmployeeRmeProps) {
  const navigate = useNavigate();

  return (
    <div className="employee-rme-page">
      <header className="page-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} />
        </button>
        <div className="header-info">
          <h1>Mes Formations RME/ASCA</h1>
          <p>Gestion de vos heures de formation continue</p>
        </div>
      </header>

      <main className="page-content">
        <RmeEmployeeView 
          employeeId={user.id.toString()} 
          employeeName={`${user.prenom} ${user.nom}`}
        />
      </main>
    </div>
  );
}

