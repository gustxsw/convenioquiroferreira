type ActorUser = {
  id: number;
  currentRole?: string;
  linkedProfessionalId?: number | null;
};

/**
 * ID do profissional cujos dados devem ser usados em APIs do painel profissional
 * (próprio profissional ou o vinculado à secretária).
 */
export function getProfessionalActorId(user: ActorUser | null): number | undefined {
  if (!user) return undefined;
  if (user.currentRole === "secretaria" && user.linkedProfessionalId != null) {
    return user.linkedProfessionalId;
  }
  return user.id;
}
