import { redirect } from "next/navigation";

/** There is no separate worker registry: workers are recorded by name when material is handed out. */
export default function EmployeesPage() {
  redirect("/sites");
}
