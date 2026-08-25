import React from "react";

export function NovaTableSkeleton({ rowCount = 15 }: { rowCount?: number }) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, rIdx) => (
        <tr
          key={`skeleton-${rIdx}`}
          className="animate-pulse border-b border-neutral-200 dark:border-neutral-800"
        >
          <td className="px-3 py-3">
            <div className="h-3 w-4 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </td>
          <td className="px-3 py-3">
            <div className="h-3 w-10 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </td>
          <td className="px-3 py-3">
            <div className="h-3 w-28 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </td>
          <td className="px-3 py-3">
            <div className="h-3 w-32 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </td>
          <td className="px-3 py-3">
            <div className="h-3 w-16 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </td>
          <td className="px-3 py-3">
            <div className="h-3 w-8 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </td>
          <td className="px-3 py-3">
            <div className="h-3 w-12 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </td>
          <td className="px-3 py-3">
            <div className="h-3 w-14 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </td>
          <td className="px-3 py-3">
            <div className="h-3 w-20 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </td>
        </tr>
      ))}
    </>
  );
}
