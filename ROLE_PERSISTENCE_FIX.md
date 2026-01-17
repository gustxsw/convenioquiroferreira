# Role Persistence Bug Fix Documentation

## Problem Summary

Users experienced incorrect role redirects when:
1. Logging in after previously closing the browser tab
2. The system used stale `localStorage` data from previous sessions
3. Users were redirected to wrong panels with mismatched roles
4. Backend returned errors due to role mismatches

## Root Causes

1. **Stale localStorage Data**: Old role data persisted between sessions
2. **No Session Validation**: App didn't validate stored session with backend on startup
3. **localStorage-Based Redirects**: Redirects relied on stale client-side data
4. **Missing Cleanup**: No mechanism to clear outdated role information

## Complete Solution

### 1. Backend: New Session Validation Endpoint

**File**: `server/index.js`

Added `/api/auth/me` endpoint (line 1017) that:
- Uses `authenticate` middleware to validate JWT tokens
- Fetches current user data from database
- Returns user info with correct `currentRole`
- Returns 401 if token is invalid or expired

```javascript
app.get("/api/auth/me", authenticate, async (req, res) => {
  // Validates session and returns current user with role
});
```

### 2. Frontend: Session Recovery on App Start

**File**: `src/contexts/AuthContext.tsx`

**Changes**:

#### a) Clean Stale Data on Initialization (lines 44-111)
```typescript
useEffect(() => {
  const checkAuthStatus = async () => {
    // Step 1: Check for tokens
    const token = localStorage.getItem("token");
    const refreshToken = localStorage.getItem("refreshToken");

    if (!token || !refreshToken) {
      // Clean ALL stale data
      localStorage.removeItem("user");
      localStorage.removeItem("tempUser");
      localStorage.removeItem("role");
      localStorage.removeItem("userType");
      return;
    }

    // Step 2: Validate session with backend
    const response = await fetch(`${apiUrl}/api/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Step 3: Handle response
    if (!response.ok) {
      // Session invalid - clean everything
      localStorage.clear();
      setUser(null);
    } else {
      // Session valid - use backend data
      const data = await response.json();
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.removeItem("tempUser");
      localStorage.removeItem("role");
      localStorage.removeItem("userType");
      setUser(data.user);
    }
  };

  checkAuthStatus();
}, []);
```

#### b) Updated selectRole Function (lines 164-215)
- Cleans stale data before setting new role
- Uses backend response for role instead of parameter
- Redirects based on `data.user.currentRole` from backend

```typescript
const selectRole = async (userId: number, role: string) => {
  // Clean stale data
  localStorage.removeItem("tempUser");
  localStorage.removeItem("role");
  localStorage.removeItem("userType");

  // Get tokens from backend
  const data = await response.json();
  localStorage.setItem("token", data.accessToken);
  localStorage.setItem("refreshToken", data.refreshToken);
  localStorage.setItem("user", JSON.stringify(data.user));

  // Redirect based ONLY on backend response
  const selectedRole = data.user.currentRole;
  navigate(`/${selectedRole}`, { replace: true });
};
```

#### c) Updated switchRole Function (lines 217-266)
- Uses backend response for navigation
- Cleans up properly on errors

#### d) Enhanced logout Function (lines 264-302)
- Cleans ALL localStorage items including stale ones
- Ensures clean state even if backend call fails

### 3. Frontend: Improved Route Protection

**File**: `src/App.tsx`

**Changes** (lines 30-67):
```typescript
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated } = useAuth();

  // Clean everything if not authenticated
  if (!isAuthenticated || !user) {
    localStorage.clear();
    return <Navigate to="/" replace />;
  }

  // Check role authorization
  if (!allowedRoles.includes(user.currentRole || "")) {
    // Redirect to correct panel based on actual role
    return <Navigate to={`/${user.currentRole}`} replace />;
  }

  return <>{children}</>;
};
```

### 4. Frontend: API Helpers Update

**File**: `src/utils/apiHelpers.ts`

**Changes**:
- Updated `refreshAccessToken` to clean stale data on failure
- Fixed redirect path from `/login` to `/` (root is login page)
- Added cleanup for `tempUser`, `role`, and `userType`

## How It Works Now

### First Visit Flow
1. User opens app
2. No tokens found
3. Clean any stale localStorage data
4. Show login page

### Login Flow
1. User enters credentials
2. Backend validates and returns user with roles
3. Frontend stores ONLY backend response
4. Redirect based ONLY on `user.currentRole` from backend

### Returning User Flow (Tab Closed, Not Logged Out)
1. User opens app
2. Tokens found in localStorage
3. **Call `/api/auth/me` to validate session**
4. If valid: Use backend response, clean stale data, restore session
5. If invalid: Clean everything, show login page

### Re-login After Tab Closed
1. User logs in again
2. Old localStorage data cleaned on app start
3. New login creates fresh session
4. Backend returns current role
5. Redirect to correct panel
6. **NO MORE STALE DATA!**

## What Was Fixed

### Before
❌ App used stale `localStorage.getItem("role")` from previous session
❌ No validation with backend on app start
❌ Redirects based on old client-side data
❌ Wrong panel loaded with mismatched role
❌ Backend errors due to role mismatch

### After
✅ App validates session with backend via `/api/auth/me`
✅ Stale data cleaned on initialization
✅ Redirects use ONLY backend response
✅ Correct panel loads with correct role
✅ No backend errors
✅ No forced manual logout needed

## localStorage Management

### Items Cleaned on Initialization
- `token` (if invalid)
- `refreshToken` (if invalid)
- `user` (if invalid)
- `tempUser` (always cleaned)
- `role` (always cleaned - deprecated)
- `userType` (always cleaned - deprecated)

### Items Kept (if valid)
- `token` (validated with backend)
- `refreshToken` (validated with backend)
- `user` (updated from backend response)

## Error Handling

### Session Validation Fails
- Clean all localStorage
- Redirect to login
- User sees fresh login page

### Token Refresh Fails
- Clean all localStorage
- Redirect to root (login)
- User must re-login

### Role Mismatch
- Redirect to correct panel based on backend role
- No data corruption
- No need to logout manually

## Testing Checklist

- [x] Login with single role → correct panel
- [x] Login with multiple roles → role selection → correct panel
- [x] Close tab → reopen → session restored correctly
- [x] Close tab → reopen → login again → correct panel (no stale data)
- [x] Switch roles → correct panel loaded
- [x] Token expires → auto refresh → session continues
- [x] Refresh token expires → clean logout → login page
- [x] Manual logout → all data cleaned
- [x] Invalid token → redirect to login with cleanup

## Best Practices Implemented

1. **Single Source of Truth**: Backend always provides the role
2. **Clean Initialization**: Stale data removed on app start
3. **Session Validation**: Every app start validates with backend
4. **Proper Cleanup**: All logout/error paths clean localStorage
5. **No localStorage Redirects**: Never redirect based on stale client data
6. **Backend-Driven Navigation**: All redirects use fresh backend response

## Migration Notes

No data migration needed. The fix:
- Removes deprecated `role` and `userType` from localStorage
- Adds session validation on app start
- Maintains backward compatibility with existing user sessions

## Summary

The role persistence bug is now completely fixed. Users can:
- Close and reopen tabs without issues
- Login multiple times without role confusion
- Switch roles reliably
- Experience clean session management

All redirects now use fresh backend data, eliminating stale localStorage issues.
