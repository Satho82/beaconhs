import { and, eq, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { notifications, riskAssessments, tenantUsers } from '@beaconhs/db/schema'

export async function scanRiskReviews(now = new Date()) {
  return withSuperAdmin(db, async (tx) => {
    const today = now.toISOString().slice(0, 10)
    const rows = await tx
      .select({
        id: riskAssessments.id,
        tenantId: riskAssessments.tenantId,
        propertyId: riskAssessments.propertyId,
        reference: riskAssessments.reference,
        title: riskAssessments.title,
        nextReviewDate: riskAssessments.nextReviewDate,
        reminderLeadDays: riskAssessments.reminderLeadDays,
        responsibleTenantUserId: riskAssessments.responsibleTenantUserId,
        userId: tenantUsers.userId,
      })
      .from(riskAssessments)
      .leftJoin(
        tenantUsers,
        and(
          eq(tenantUsers.tenantId, riskAssessments.tenantId),
          eq(tenantUsers.id, riskAssessments.responsibleTenantUserId),
        ),
      )
      .where(
        and(
          isNull(riskAssessments.deletedAt),
          ne(riskAssessments.status, 'draft'),
          ne(riskAssessments.status, 'retired'),
          isNotNull(riskAssessments.nextReviewDate),
          lte(
            riskAssessments.nextReviewDate,
            sql`(${today}::date + ${riskAssessments.reminderLeadDays})`,
          ),
        ),
      )

    let reminders = 0
    for (const row of rows) {
      const overdue = row.nextReviewDate! < today
      const dueToday = row.nextReviewDate === today
      const status = overdue ? 'overdue' : dueToday ? 'review_due' : 'due_soon'
      await tx
        .update(riskAssessments)
        .set({ status, updatedAt: now })
        .where(and(eq(riskAssessments.tenantId, row.tenantId), eq(riskAssessments.id, row.id)))
      if (!row.userId) continue
      const sourceJobId = `risk-review:${row.id}:${row.nextReviewDate}`
      const inserted = await tx
        .insert(notifications)
        .values({
          tenantId: row.tenantId,
          userId: row.userId,
          category: 'risk',
          type: 'risk.review_due',
          title: overdue ? 'Risk assessment review overdue' : 'Risk assessment review due soon',
          body: `${row.reference} · ${row.title} · review ${row.nextReviewDate}`,
          linkPath: `/hospitality/risk/assessments/${row.id}`,
          data: {
            assessmentId: row.id,
            propertyId: row.propertyId,
            nextReviewDate: row.nextReviewDate,
          },
          isCritical: overdue,
          sourceJobId,
          occurredAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id })
      reminders += inserted.length
      if (inserted.length) {
        await tx
          .update(riskAssessments)
          .set({ lastReminderReviewDate: row.nextReviewDate })
          .where(and(eq(riskAssessments.tenantId, row.tenantId), eq(riskAssessments.id, row.id)))
      }
    }
    return { examined: rows.length, reminders }
  })
}
