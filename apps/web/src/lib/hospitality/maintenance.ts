import { and, eq, isNull } from 'drizzle-orm'
import { maintenanceIssues, hospitalityRooms } from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { recordAudit } from '@/lib/audit'
const priorities=new Set(['low','medium','high','critical'])
async function gate(ctx:RequestContext,write=false){await assertTenantModuleEntitled(ctx,'hospitality.maintenance');assertCan(ctx,write?'maintenance.update':'maintenance.read')}
export async function createRoomMaintenanceIssue(ctx:RequestContext,roomId:string,title:string,description:string,priority:string){await gate(ctx,true);if(!priorities.has(priority))throw new Error('Invalid maintenance priority');const[room]=await ctx.db(tx=>tx.select({id:hospitalityRooms.id}).from(hospitalityRooms).where(and(eq(hospitalityRooms.tenantId,ctx.tenantId),eq(hospitalityRooms.id,roomId),isNull(hospitalityRooms.deletedAt))).limit(1));if(!room)throw new Error('No room exists in this tenant');const[r]=await ctx.db(tx=>tx.insert(maintenanceIssues).values({tenantId:ctx.tenantId,roomId,reference:`MI-${Date.now()}`,summary:title.trim(),description:description.trim()||null,priority,reportedByTenantUserId:ctx.membership?.id??null}).returning());if(!r)throw new Error('Issue creation failed');await recordAudit(ctx,{entityType:'maintenance_issue',entityId:r.id,action:'create',summary:`Reported maintenance issue ${r.reference}`});return r}
