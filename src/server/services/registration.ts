import { z } from "zod";
import { withTx } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * Self-registration. The user picks an account type (worker / company / client); the account is created
 * INACTIVE and pending until an administrator approves it and assigns the exact role and project.
 * Nobody can grant themselves rights by registering.
 */
export const registerSchema = z
  .object({
    accountType: z.enum(["COMPANY", "CLIENT"], { errorMap: () => ({ message: "Hesab növünü seçin." }) }),
    name: z.string().trim().min(3, "Ad, soyad məcburidir.").max(100),
    email: z.string().trim().toLowerCase().email("E-poçt düzgün deyil."),
    phone: z.string().trim().max(30).optional().nullable(),
    note: z.string().trim().max(300).optional().nullable(),
    password: z.string().min(10, "Parol ən azı 10 simvol olmalıdır.").max(200),
    password2: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!/[A-Za-zƏəĞğİıÖöŞşÜüÇç]/.test(v.password) || !/\d/.test(v.password)) ctx.addIssue({ code: "custom", path: ["password"], message: "Parolda həm hərf, həm rəqəm olmalıdır." });
    if (v.password !== v.password2) ctx.addIssue({ code: "custom", path: ["password2"], message: "Parollar uyğun gəlmir." });
  });
export type RegisterInput = z.infer<typeof registerSchema>;

/** Least-privilege placeholder role until the admin decides. */
const PLACEHOLDER_ROLE = { EMPLOYEE: "EMPLOYEE", COMPANY: "AUDITOR", CLIENT: "CLIENT" } as const;

export async function registerAccount(input: RegisterInput, hash: (pw: string) => Promise<string>, ip?: string) {
  const d = registerSchema.parse(input);
  return withTx(async (tx) => {
    const exists = await tx.user.findUnique({ where: { email: d.email } });
    if (exists) throw new AppError("Bu e-poçt ilə hesab artıq mövcuddur və ya təsdiq gözləyir.", "DUPLICATE");
    const u = await tx.user.create({
      data: {
        email: d.email,
        name: d.name,
        phone: d.phone || null,
        note: d.note || null,
        role: PLACEHOLDER_ROLE[d.accountType],
        requestedType: d.accountType,
        isActive: false,
        pendingApproval: true,
        passwordHash: await hash(d.password),
      },
    });
    await tx.auditLog.create({ data: { userId: u.id, userEmail: u.email, action: "REGISTER", entityType: "User", entityId: u.id, summary: `Qeydiyyat sorğusu: ${d.accountType}`, ip } });
    return { id: u.id };
  });
}
