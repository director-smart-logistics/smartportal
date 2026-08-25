/**
 * Smart Package Suggestion Algorithm
 * Intelligently suggests packages for a route based on destination, weight, and other factors
 */

export interface SuggestionCriteria {
  destinationLocation: string;
  maxTotalWeight?: number;
  currentTotalWeight?: number;
  maxPackages?: number;
  packageStatuses?: string[];
  prioritizeEarliestCreated?: boolean;
}

export interface SuggestedPackage {
  id: string;
  trackingNumber: string;
  customerName: string;
  weight: number;
  destination: string;
  origin: string;
  status: string;
  createdAt: string;
  matchScore: number; // 0-100
  reasons: string[]; // Why this package is suggested
}

/**
 * Calculate match score for a package
 */
function calculateMatchScore(
  pkg: any,
  criteria: SuggestionCriteria,
  routePackageIds: Set<string>,
): number {
  let score = 0;

  // Already in route: 0 points
  if (routePackageIds.has(pkg.id)) {
    return 0;
  }

  // Destination location match: 50 points
  if (
    pkg.destination
      ?.toLowerCase()
      .includes(criteria.destinationLocation.toLowerCase()) ||
    criteria.destinationLocation
      .toLowerCase()
      .includes(pkg.destination?.toLowerCase())
  ) {
    score += 50;
  } else if (pkg.destination === criteria.destinationLocation) {
    score += 30;
  }

  // Status preference (pending/intake are best): 20 points
  if (pkg.status === "pending" || pkg.status === "intake") {
    score += 20;
  } else if (pkg.status === "in_transit") {
    score += 10;
  }

  // Weight efficiency: 15 points (prefer medium-weight packages)
  if (pkg.weight && pkg.weight >= 1 && pkg.weight <= 5) {
    score += 15;
  } else if (pkg.weight && pkg.weight > 0) {
    score += 8;
  }

  // Weight within limit: 10 points
  if (criteria.maxTotalWeight && criteria.currentTotalWeight !== undefined) {
    const remainingWeight =
      criteria.maxTotalWeight - criteria.currentTotalWeight;
    if (pkg.weight && pkg.weight <= remainingWeight) {
      score += 10;
    }
  }

  // Earliest created packages (time priority): 5 points
  if (criteria.prioritizeEarliestCreated && pkg.createdAt) {
    const daysSinceCreation =
      (Date.now() - new Date(pkg.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation > 7) {
      score += 5; // Prioritize older packages
    }
  }

  return Math.min(100, score);
}

/**
 * Generate reasons why a package is suggested
 */
function generateReasons(
  pkg: any,
  criteria: SuggestionCriteria,
  matchScore: number,
): string[] {
  const reasons: string[] = [];

  if (matchScore === 0) {
    return ["Already in route"];
  }

  if (
    pkg.destination
      ?.toLowerCase()
      .includes(criteria.destinationLocation.toLowerCase())
  ) {
    reasons.push(`📍 Destination matches: ${pkg.destination}`);
  }

  if (pkg.status === "pending") {
    reasons.push("⏳ Pending delivery (priority)");
  } else if (pkg.status === "intake") {
    reasons.push("📦 Ready for delivery");
  }

  if (pkg.weight && pkg.weight <= 5) {
    reasons.push(`⚖️ Good weight: ${pkg.weight}kg`);
  }

  if (criteria.maxTotalWeight && criteria.currentTotalWeight !== undefined) {
    const remainingWeight =
      criteria.maxTotalWeight - criteria.currentTotalWeight;
    if (pkg.weight && pkg.weight <= remainingWeight) {
      reasons.push(`✅ Fits remaining capacity`);
    }
  }

  const daysSinceCreation = pkg.createdAt
    ? (Date.now() - new Date(pkg.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  if (daysSinceCreation > 7) {
    reasons.push(`⏱️ Pending for ${Math.floor(daysSinceCreation)} days`);
  }

  return reasons.length > 0 ? reasons : ["Matches route destination"];
}

/**
 * Get smart package suggestions for a route
 */
export function getSuggestedPackages(
  packages: any[],
  routePackageIds: Set<string> = new Set(),
  criteria: SuggestionCriteria,
  limit: number = 10,
): SuggestedPackage[] {
  if (!packages || packages.length === 0) {
    return [];
  }

  // Filter packages that match criteria
  const filteredPackages = packages.filter((pkg) => {
    // Exclude if already in route
    if (routePackageIds.has(pkg.id)) {
      return false;
    }

    // Only include specific statuses if specified
    if (
      criteria.packageStatuses &&
      !criteria.packageStatuses.includes(pkg.status)
    ) {
      return false;
    }

    // Skip packages that won't fit weight-wise
    if (criteria.maxTotalWeight && criteria.currentTotalWeight !== undefined) {
      const remainingWeight =
        criteria.maxTotalWeight - criteria.currentTotalWeight;
      if (pkg.weight && pkg.weight > remainingWeight) {
        return false;
      }
    }

    // Skip if already at max packages
    if (criteria.maxPackages && routePackageIds.size >= criteria.maxPackages) {
      return false;
    }

    return true;
  });

  // Score and rank packages
  const scoredPackages = filteredPackages
    .map((pkg) => {
      const matchScore = calculateMatchScore(pkg, criteria, routePackageIds);
      const reasons = generateReasons(pkg, criteria, matchScore);

      return {
        id: pkg.id,
        trackingNumber: pkg.tracking_number,
        customerName: pkg.customer_name,
        weight: pkg.weight,
        destination: pkg.destination,
        origin: pkg.origin,
        status: pkg.status,
        createdAt: pkg.created_at,
        matchScore,
        reasons,
      };
    })
    .filter((pkg) => pkg.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);

  return scoredPackages.slice(0, limit);
}

/**
 * Get all compatible packages (can be added to this route)
 */
export function getCompatiblePackages(
  packages: any[],
  routePackageIds: Set<string>,
  destinationLocation: string,
  maxTotalWeight?: number,
  currentTotalWeight?: number,
): any[] {
  return packages.filter((pkg) => {
    // Exclude if already in route
    if (routePackageIds.has(pkg.id)) {
      return false;
    }

    // Must have compatible destination
    if (
      !pkg.destination
        ?.toLowerCase()
        .includes(destinationLocation.toLowerCase()) &&
      !destinationLocation
        .toLowerCase()
        .includes(pkg.destination?.toLowerCase())
    ) {
      return false;
    }

    // Check weight constraint
    if (maxTotalWeight && currentTotalWeight !== undefined) {
      const remainingWeight = maxTotalWeight - currentTotalWeight;
      if (pkg.weight && pkg.weight > remainingWeight) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Estimate route capacity based on package distribution
 */
export function estimateCapacity(packages: any[]): {
  totalWeight: number;
  averageWeight: number;
  packageCount: number;
  estimatedDuration: string;
} {
  const totalWeight = packages.reduce((sum, pkg) => sum + (pkg.weight || 0), 0);
  const averageWeight = packages.length > 0 ? totalWeight / packages.length : 0;
  const packageCount = packages.length;

  // Rough estimate: 2-3 minutes per package, plus 15 minutes base
  const estimatedMinutes = 15 + packageCount * 2.5;
  const hours = Math.floor(estimatedMinutes / 60);
  const minutes = Math.round(estimatedMinutes % 60);
  const estimatedDuration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return {
    totalWeight,
    averageWeight,
    packageCount,
    estimatedDuration,
  };
}

/**
 * Filter packages by location search
 */
export function filterPackagesByLocation(
  packages: any[],
  searchTerm: string,
): any[] {
  const term = searchTerm.toLowerCase();

  return packages.filter(
    (pkg) =>
      pkg.destination?.toLowerCase().includes(term) ||
      pkg.origin?.toLowerCase().includes(term) ||
      pkg.customer_name?.toLowerCase().includes(term) ||
      pkg.tracking_number?.toLowerCase().includes(term),
  );
}
