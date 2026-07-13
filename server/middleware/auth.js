import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { normalizeProfessionalType } from './professionalConvenioAccess.js';

export const authenticate = async (req, res, next) => {
  try {
    // SECURITY: prefer the Authorization header over the cookie.
    // The cookie can persist across logout (depending on browser /
    // clearCookie option matching) and previously could shadow a fresh
    // Authorization header, causing the server to act on behalf of a
    // stale user. By treating the header as the source of truth and
    // only falling back to the cookie when no header is present, we
    // make the user identity always match the token the SPA is sending.
    const headerToken =
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.slice(7).trim()
        : null;
    const cookieToken = req.cookies?.token || null;
    const token = headerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ message: 'Não autorizado', code: 'NO_TOKEN' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        console.log('❌ Access token expired');
        return res.status(401).json({ message: 'Token expirado', code: 'TOKEN_EXPIRED' });
      }
      console.error('❌ Invalid token:', error.message);
      return res.status(401).json({ message: 'Token inválido', code: 'INVALID_TOKEN' });
    }

    // Defensive: if both a header and a cookie are sent and they decode to
    // DIFFERENT users, something is inconsistent (e.g. stale cookie from a
    // previous session). Treat as untrusted and force re-auth instead of
    // silently picking one and possibly returning data for the wrong user.
    if (headerToken && cookieToken && headerToken !== cookieToken) {
      try {
        const cookieDecoded = jwt.verify(
          cookieToken,
          process.env.JWT_SECRET || "your-secret-key"
        );
        if (cookieDecoded?.id && cookieDecoded.id !== decoded.id) {
          console.warn(
            "🚨 Header/cookie user mismatch — rejecting request",
            { headerUser: decoded.id, cookieUser: cookieDecoded.id }
          );
          // Best-effort: clear the stale cookie on this response.
          res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
          });
          return res.status(401).json({
            message: "Sessão inconsistente. Faça login novamente.",
            code: "SESSION_MISMATCH",
          });
        }
      } catch (_) {
        // Cookie token is invalid/expired — header wins, keep going but
        // proactively clear the bad cookie.
        res.clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        });
      }
    }

    const result = await pool.query(
      `SELECT id, name, cpf, roles, professional_type,
              primary_specialty_code, onboarding_status,
              linked_professional_id, linked_professional_ids
       FROM users WHERE id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Usuário não encontrado', code: 'USER_NOT_FOUND' });
    }

    const user = result.rows[0];

    const roles = user.roles || [];
    const currentRole = decoded.currentRole || (user.roles && user.roles[0]);
    const isProfessional = roles.includes("professional");

    let professionalScopeId = null;
    let professionalTypeForAccess = normalizeProfessionalType(user.professional_type);
    let primarySpecialtyForAccess = user.primary_specialty_code || null;
    let onboardingResolved = null;
    // Conjunto de profissionais que a secretária pode operar (multi-vínculo).
    let linkedProfessionalIds = [];

    if (currentRole === "secretaria") {
      if (!roles.includes("secretaria")) {
        return res.status(403).json({
          message: "Token com role inválida para este usuário",
          code: "ROLE_TOKEN_MISMATCH",
        });
      }
      // Lista permitida: prioriza o array; cai para o vínculo legado (singular).
      const rawIds =
        Array.isArray(user.linked_professional_ids) &&
        user.linked_professional_ids.length > 0
          ? user.linked_professional_ids
          : user.linked_professional_id != null
          ? [user.linked_professional_id]
          : [];
      linkedProfessionalIds = [...new Set(rawIds.map(Number).filter(Boolean))];

      if (linkedProfessionalIds.length === 0) {
        return res.status(403).json({
          message: "Secretária sem profissional vinculado. Contate o administrador.",
          code: "SECRETARY_NO_LINK",
        });
      }

      // Profissional ativo: o do token se estiver na lista permitida; senão o
      // primeiro. Isso impede a secretária de forçar um profissional fora da lista.
      const requested = decoded.professionalScopeId != null ? Number(decoded.professionalScopeId) : null;
      const activeId =
        requested != null && linkedProfessionalIds.includes(requested)
          ? requested
          : linkedProfessionalIds[0];

      const proRes = await pool.query(
        `SELECT id, professional_type, primary_specialty_code, roles
         FROM users WHERE id = $1`,
        [activeId]
      );
      if (
        proRes.rows.length === 0 ||
        !proRes.rows[0].roles?.includes("professional")
      ) {
        return res.status(403).json({
          message: "Vínculo de secretária inválido. Contate o administrador.",
          code: "SECRETARY_LINK_INVALID",
        });
      }
      const proRow = proRes.rows[0];
      professionalScopeId = proRow.id;
      professionalTypeForAccess = normalizeProfessionalType(proRow.professional_type);
      primarySpecialtyForAccess = proRow.primary_specialty_code || null;
      onboardingResolved = primarySpecialtyForAccess ? "completed" : "pending";
    } else if (currentRole === "professional") {
      professionalScopeId = user.id;
      if (isProfessional) {
        const hasSpecialty = Boolean(user.primary_specialty_code);
        onboardingResolved = hasSpecialty ? "completed" : "pending";
      }
    } else if (isProfessional) {
      const hasSpecialty = Boolean(user.primary_specialty_code);
      onboardingResolved = hasSpecialty ? "completed" : "pending";
    }

    req.user = {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      roles,
      currentRole,
      professional_type: professionalTypeForAccess,
      primary_specialty_code: primarySpecialtyForAccess,
      onboarding_status: onboardingResolved,
      professionalScopeId,
      // Para secretária: ativo = escopo resolvido; lista = todos os vínculos.
      linked_professional_id:
        currentRole === "secretaria"
          ? professionalScopeId
          : user.linked_professional_id || null,
      linked_professional_ids: linkedProfessionalIds,
    };

    next();
  } catch (error) {
    console.error('❌ Auth error:', error);
    return res.status(401).json({ message: 'Erro de autenticação', code: 'AUTH_ERROR' });
  }
};

export const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.currentRole) {
      return res.status(403).json({ message: 'Acesso não autorizado - role não definida' });
    }

    if (!roles.includes(req.user.currentRole)) {
      return res.status(403).json({ message: 'Acesso não autorizado para esta role' });
    }

    next();
  };
};
