import { Users } from 'lucide-react';
import type { TeamMember } from '../types';

interface TeamHeaderProps {
  members: TeamMember[];
  loading?: boolean;
}

export function TeamHeader({ members, loading }: TeamHeaderProps) {
  const activeMembers = members.filter(m => m.actif);

  if (loading) {
    return (
      <div className="team-header loading">
        <div className="team-header-icon">
          <Users size={18} />
        </div>
        <div className="team-header-content">
          <span className="team-label">Équipe du jour</span>
          <div className="team-members-skeleton">
            <div className="skeleton-pill" />
            <div className="skeleton-pill" />
            <div className="skeleton-pill" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="team-header">
      <div className="team-header-icon">
        <Users size={18} />
      </div>
      <div className="team-header-content">
        <span className="team-label">Équipe présente</span>
        <div className="team-members">
          {activeMembers.map(member => (
            <div key={member.id} className="team-member-pill">
              {member.photo_url ? (
                <img 
                  src={member.photo_url} 
                  alt={`${member.prenom} ${member.nom}`}
                  className="member-avatar"
                />
              ) : (
                <div className="member-avatar-placeholder">
                  {member.prenom[0]}{member.nom[0]}
                </div>
              )}
              <span className="member-name">
                {member.prenom} {member.nom}
              </span>
              <span className="member-role">{member.fonction}</span>
            </div>
          ))}
          {activeMembers.length === 0 && (
            <span className="no-members">Aucun membre chargé</span>
          )}
        </div>
      </div>
    </div>
  );
}

