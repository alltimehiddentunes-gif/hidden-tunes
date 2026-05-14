"use client";

import AdminGuard from "../../../components/AdminGuard";
import BulkUploadPanel from "../../../components/BulkUploadPanel";

export default function AdminUploadPage() {
  return (
    <AdminGuard>
      <BulkUploadPanel />
    </AdminGuard>
  );
}