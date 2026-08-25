import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Loader2 } from 'lucide-react';
import { collection, query, onSnapshot, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { RouteSession } from '@/lib/services/route-session-service';
import { useAuth } from '@/hooks/useAuth';
import { docToSession } from '@/lib/services/route-session-service';
import { StartRouteWizard, ActiveRouteView } from './DriverRouteWizard';

export default function RouteSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<RouteSession[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;
    
    // Solo buscamos las sesiones de ESTE usuario, de lo contrario dará error de permisos.
    const q = query(
      collection(db, 'route_sessions'),
      where('driverId', '==', user.id),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs: RouteSession[] = snap.docs.map(d => docToSession(d.id, d.data()));
      setSessions(docs);
      setLoading(false);
    }, (err) => {
      console.error("Snapshot error in route sessions:", err);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }
  
  const activeSession = sessions.find(s => s.status === 'open');
  if (activeSession) {
    return (
      <DashboardLayout hideNavbar>
        <ActiveRouteView session={activeSession} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <StartRouteWizard user={user} />
    </DashboardLayout>
  );
}
