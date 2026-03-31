"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveDepartment } from "./actions";

interface Department {
  id: string;
  name: string;
  slug: string;
}

export default function DepartmentPicker({
  departments,
  currentDeptId,
  dashboardUrl,
}: {
  departments: Department[];
  currentDeptId: string | null;
  dashboardUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(deptId: string) {
    startTransition(async () => {
      await setActiveDepartment(deptId);
      router.push(dashboardUrl);
    });
  }

  return (
    <div className="space-y-3">
      {departments.map((dept) => {
        const isSelected = dept.id === currentDeptId;
        return (
          <button
            key={dept.id}
            onClick={() => handleSelect(dept.id)}
            disabled={isPending}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
              isSelected
                ? "border-brand-teal bg-teal-50"
                : "border-gray-100 hover:border-brand-teal hover:bg-teal-50/50"
            } ${isPending ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isSelected ? "bg-brand-teal" : "bg-surface-gray"
              }`}
            >
              <svg
                className={`w-5 h-5 ${isSelected ? "text-white" : "text-brand-teal"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-text-body">{dept.name}</p>
            </div>
            {isSelected && (
              <svg
                className="w-5 h-5 text-brand-teal flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
