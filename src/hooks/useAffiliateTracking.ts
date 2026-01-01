import { useEffect, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const STORAGE_KEY = "affiliate_referral";
const VISITOR_ID_KEY = "visitor_id";

// Generate a unique visitor identifier
function getOrCreateVisitorId(): string {
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);

  if (!visitorId) {
    // Create a unique ID based on timestamp and random number
    visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }

  return visitorId;
}

// Get browser fingerprint data
function getBrowserFingerprint() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function useAffiliateTracking() {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per session
    if (hasTracked.current) return;
    hasTracked.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const referralCode = urlParams.get("ref");

    if (referralCode) {
      trackAffiliateReferral(referralCode);
    } else {
      // Check if there's an existing referral in storage
      const existingReferral = localStorage.getItem(STORAGE_KEY);
      if (existingReferral) {
        console.log("Existing affiliate referral found:", JSON.parse(existingReferral));
      }
    }
  }, []);

  return {
    getStoredReferral,
    clearStoredReferral,
    getVisitorId: getOrCreateVisitorId,
  };
}

async function trackAffiliateReferral(referralCode: string) {
  try {
    const visitorIdentifier = getOrCreateVisitorId();
    const metadata = {
      ...getBrowserFingerprint(),
      referrerUrl: document.referrer,
      landingPage: window.location.href,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(`${API_URL}/api/affiliate-tracking/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        referralCode,
        visitorIdentifier,
        metadata,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to track referral");
    }

    const data = await response.json();

    // Store referral info in localStorage
    const referralInfo = {
      referralCode,
      referralId: data.referralId,
      affiliateName: data.affiliateName,
      trackedAt: new Date().toISOString(),
      visitorIdentifier,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(referralInfo));

    console.log("✅ Affiliate referral tracked successfully:", data);

    // Remove the ref parameter from URL without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    window.history.replaceState({}, "", url.toString());

  } catch (error) {
    console.error("Error tracking affiliate referral:", error);
  }
}

export function getStoredReferral() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function clearStoredReferral() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function linkUserToAffiliate(userId: number) {
  try {
    const visitorIdentifier = getOrCreateVisitorId();

    const response = await fetch(`${API_URL}/api/affiliate-tracking/link-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        visitorIdentifier,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to link user to affiliate");
    }

    const data = await response.json();
    console.log("✅ User linked to affiliate:", data);

    return data;
  } catch (error) {
    console.error("Error linking user to affiliate:", error);
    throw error;
  }
}

export async function markReferralAsConverted(userId?: number) {
  try {
    const token = localStorage.getItem("token");

    if (!token) {
      console.log("No token found, skipping conversion tracking");
      return;
    }

    const response = await fetch(`${API_URL}/api/affiliate-tracking/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error("Failed to mark referral as converted");
    }

    const data = await response.json();
    console.log("✅ Referral marked as converted:", data);

    return data;
  } catch (error) {
    console.error("Error marking referral as converted:", error);
    throw error;
  }
}
