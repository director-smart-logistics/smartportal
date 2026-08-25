/**
 * Customer Firestore triggers — SP1 → SP2 customer routing sync.
 *
 * This trigger ensures that whenever a customer's route is updated in SP1
 * (either through the EditCustomerModal, NovaTableModal, or any other UI path),
 * the change is immediately propagated to the customer's profile in SP2.
 *
 * It also automatically resolves and links the SP1 `preferredRoute` and
 * `preferredRouteId` based on the route name to keep the data canonical.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { db } from "../config/firebase";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { sendEmail } from "../email/email-service";
import { logServerAuditEvent } from "../audit/audit-service";

// SP2 Project ID configuration
const SP2_PROJECT_ID = "smart-portal-2";
let sp2Db: FirebaseFirestore.Firestore | null = null;

/**
 * Get SP2 Firestore instance safely in the backend.
 */
function getSp2Firestore(): FirebaseFirestore.Firestore {
  if (sp2Db) return sp2Db;

  const sp2AppName = "smart-portal-2";
  const existingApp = getApps().find(app => app.name === sp2AppName);

  if (existingApp) {
    sp2Db = getFirestore(existingApp);
  } else {
    const sp2App = initializeApp({
      projectId: SP2_PROJECT_ID,
    }, sp2AppName);
    sp2Db = getFirestore(sp2App);
  }

  return sp2Db;
}

/**
 * Resolve the preferred route document and status by name.
 */
async function resolvePreferredRoute(rutaName: string | null | undefined): Promise<{
  preferredRouteId: string | null;
  preferredRoute: { id: string; name: string; status: string } | null;
}> {
  if (!rutaName) {
    return { preferredRouteId: null, preferredRoute: null };
  }

  try {
    const routesSnap = await db.collection("routes")
      .where("name", "==", rutaName)
      .limit(1)
      .get();

    if (!routesSnap.empty) {
      const routeDoc = routesSnap.docs[0];
      const routeData = routeDoc.data();
      return {
        preferredRouteId: routeDoc.id,
        preferredRoute: {
          id: routeDoc.id,
          name: routeData.name || rutaName,
          status: routeData.status || "active",
        },
      };
    }
  } catch (error) {
    logger.warn(`[customer-trigger] Failed to resolve route for name "${rutaName}":`, error);
  }

  return { preferredRouteId: null, preferredRoute: null };
}

/**
 * Send an email alert to management about route changes.
 */
async function sendRouteUpdateAlert(
  slCode: string,
  fullName: string,
  oldRoute: string | null,
  newRoute: string,
  actor: string,
  source: 'SP1 (Admin)' | 'SP2 (Clientes)'
) {
  const recipients = ['gerencia@smartlogisticscr.com', 'director@smartlogisticscr.com'];
  const subject = `⚠️ Cambio de Ruta Logística — Cliente ${slCode}`;
  
  const nowStr = new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' }) + ' ' +
                 new Date().toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica' });

  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #c2410c; margin-top: 0;">Alerta de Cambio de Ruta Logística</h2>
      <p>Se ha modificado la ruta de entrega para el siguiente cliente:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #eee; width: 150px;">Cliente:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${fullName} (${slCode})</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #eee;">Origen del cambio:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${source}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #eee;">Ruta Anterior:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #dc2626; font-weight: bold;">${oldRoute || 'Ninguna'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #eee;">Ruta Nueva:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #16a34a; font-weight: bold;">${newRoute}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #eee;">Modificado por:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${actor}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #eee;">Fecha / Hora:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${nowStr} (CR)</td>
        </tr>
      </table>
      
      <p style="font-size: 12px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
        Este es un correo automático del sistema SmartLogistics. Por favor no responder a este mensaje.
      </p>
    </div>
  `;

  for (const to of recipients) {
    try {
      await sendEmail({
        to,
        subject,
        html,
        text: `Cambio de Ruta Logística\n\nCliente: ${fullName} (${slCode})\nOrigen: ${source}\nRuta Anterior: ${oldRoute || 'Ninguna'}\nRuta Nueva: ${newRoute}\nModificado por: ${actor}\nFecha/Hora: ${nowStr} (CR)`
      });
      logger.info(`[customer-trigger] Route change alert email sent to ${to} for ${slCode}`);
    } catch (err) {
      logger.error(`[customer-trigger] Failed to send route change email to ${to}:`, err);
    }
  }
}

/**
 * Firestore trigger on SP1 customer write.
 */
export const onCustomerWritten = onDocumentWritten(
  {
    document: "customers/{customerId}",
    database: "portal",
    region: "us-central1",
  },
  async (event) => {
    if (!event.data) {
      return;
    }
    const customerId = event.params.customerId;
    const before = event.data.before?.data();
    const after = event.data.after?.data();

    // 1. Deletion check
    if (before && !after) {
      logger.info(`[customer-trigger] Customer ${customerId} deleted in SP1.`);
      return;
    }

    if (!after) return;

    const beforeRuta = before?.ruta;
    const afterRuta = after.ruta;
    const beforeCons = before?.consolidationEnabled;
    const afterCons = after.consolidationEnabled;
    const slCode = after.slCode || customerId;

    // 2. Loop prevention and change validation
    const rutaChanged = beforeRuta !== afterRuta;
    const consChanged = beforeCons !== afterCons;

    if (!rutaChanged && !consChanged && before !== undefined) {
      return;
    }

    logger.info(`[customer-trigger] Customer ${slCode} update detected in SP1: rutaChanged=${rutaChanged}, consChanged=${consChanged}`);

    // 3. Resolve preferredRouteId and preferredRoute based on route name (ruta)
    const { preferredRouteId, preferredRoute } = await resolvePreferredRoute(afterRuta);
    const currentRouteId = after.preferredRouteId || null;
    const currentRoute = after.preferredRoute || null;

    const updatedSp1Payload: Record<string, any> = {};

    // If ruta changed, append to SP1 routeHistory and log audit/send email
    if (rutaChanged && before !== undefined) {
      const currentHistory = after.routeHistory || [];
      const lastEntry = currentHistory[currentHistory.length - 1];
      const newRutaVal = afterRuta || '';
      
      const isDuplicate = lastEntry && 
        lastEntry.newRuta === newRutaVal && 
        lastEntry.previousRuta === (beforeRuta || null);
        
      if (!isDuplicate) {
        const actor = after.rutaLastUpdatedBy || 'sp1_admin';
        const source = after.syncSource === 'smart-portal-2' ? 'sp2_admin' : 'sp1_admin';
        const direction = after.syncSource === 'smart-portal-2' ? 'sp2_to_sp1' : 'sp1_to_sp2';
        
        const newEntry = {
          previousRuta: beforeRuta || null,
          newRuta: newRutaVal,
          changedAt: new Date().toISOString(),
          changedBy: actor,
          source,
          direction
        };
        
        updatedSp1Payload.routeHistory = [...currentHistory, newEntry];
      }

      // Send route update email ONLY if the change originated in SP1 (not synced from SP2)
      const isSp2Sync = after.syncSource === 'smart-portal-2';
      const actor = after.rutaLastUpdatedBy || (isSp2Sync ? 'admin_sp2' : 'admin_sp1');
      const sourceLabel = isSp2Sync ? 'SP2 (Clientes)' : 'SP1 (Admin)';
      
      if (!isSp2Sync) {
        await sendRouteUpdateAlert(
          slCode,
          after.fullName || `${after.firstName || ''} ${after.lastName || ''}`.trim() || 'Usuario',
          beforeRuta || null,
          newRutaVal,
          actor,
          sourceLabel
        );
      } else {
        logger.info(`[customer-trigger] Skipping route update email in SP1 because change was synced from SP2 for ${slCode}`);
      }

      // Log server audit event
      logServerAuditEvent({
        userId: actor,
        userName: 'Admin',
        userEmail: actor.includes('@') ? actor : 'admin@smartlogisticscr.com',
        action: 'customer_updated',
        category: 'customer',
        resource: 'customers',
        resourceId: slCode,
        result: 'success',
        metadata: {
          previousRuta: beforeRuta || null,
          newRuta: newRutaVal,
          source: sourceLabel,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (currentRouteId !== preferredRouteId || JSON.stringify(currentRoute) !== JSON.stringify(preferredRoute)) {
      logger.info(`[customer-trigger] Updating preferredRoute for customer ${slCode} to match route name "${afterRuta}"`);
      updatedSp1Payload.preferredRouteId = preferredRouteId;
      updatedSp1Payload.preferredRoute = preferredRoute;
      updatedSp1Payload.updatedAt = FieldValue.serverTimestamp();
    }

    // Reset syncRutaToSp2 flag in SP1 so it doesn't run again next time
    if (after.syncRutaToSp2 === true) {
      updatedSp1Payload.syncRutaToSp2 = false;
    }

    if (Object.keys(updatedSp1Payload).length > 0) {
      await event.data.after.ref.update(updatedSp1Payload);
    }

    // 4. Update the matching user document in SP2
    try {
      const sp2DbInstance = getSp2Firestore();
      const sp2Snap = await sp2DbInstance.collection("users")
        .where("slCode", "==", slCode)
        .limit(1)
        .get();

      if (!sp2Snap.empty) {
        const userDoc = sp2Snap.docs[0];
        const userData = userDoc.data();
        const sp2Cons = userData.consolidationEnabled || false;
        const targetCons = afterCons || false;

        const updatePayload: Record<string, any> = {};

        // SP1 MANDATE: Route changes in SP1 are NOT automatically pushed to SP2 by background triggers.
        // Route updates to SP2 are only sent when explicitly chosen by the admin in SP1 UI (syncRutaToSp2 === true).
        if (after.syncRutaToSp2 === true && afterRuta) {
          updatePayload.ruta = afterRuta;
          updatePayload.rutaUpdatedByAdmin = true;
          updatePayload.rutaSetByAdminAt = after.rutaSetByAdminAt || new Date().toISOString();
          updatePayload.rutaLastUpdatedBy = after.rutaLastUpdatedBy || 'sp1_admin';
          updatePayload.encomiendaProvider = afterRuta === 'Encomiendas' ? (after.encomiendaServiceName || after.encomiendaProvider || '') : '';
          
          const currentSp2History = userData.routeHistory || [];
          updatePayload.routeHistory = [...currentSp2History, {
            previousRuta: userData.ruta || null,
            newRuta: afterRuta,
            changedAt: new Date().toISOString(),
            changedBy: after.rutaLastUpdatedBy || 'sp1_admin',
            source: 'sp1_admin',
            direction: 'sp1_to_sp2'
          }];
        }

        if (consChanged || before === undefined) {
          if (sp2Cons !== targetCons) {
            updatePayload.consolidationEnabled = targetCons;
            if (targetCons) {
              updatePayload.consolidationEnabledAt = after.consolidationEnabledAt || new Date().toISOString();
            } else {
              updatePayload.consolidationDisabledAt = after.consolidationDisabledAt || new Date().toISOString();
            }
          }
        }

        if (Object.keys(updatePayload).length > 0) {
          const now = FieldValue.serverTimestamp();
          updatePayload.updatedAt = now;
          updatePayload.sp1LastPushAt = now;

          await userDoc.ref.update(updatePayload);
          logger.info(`[customer-trigger] Successfully updated SP2 user ${slCode} fields:`, Object.keys(updatePayload));
        } else {
          logger.info(`[customer-trigger] SP2 user ${slCode} already in sync. Skipping SP2 update.`);
        }
      } else {
        logger.warn(`[customer-trigger] Matching user for slCode "${slCode}" not found in SP2.`);
      }
    } catch (error: any) {
      logger.error(`[customer-trigger] Failed to update user route/consolidation in SP2 for ${slCode}:`, error);
    }
  }
);
