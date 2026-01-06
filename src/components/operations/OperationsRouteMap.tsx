import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MapPin, 
  Navigation, 
  Locate, 
  Users,
  Route,
  CheckCircle2,
  Loader2,
  Factory,
  RefreshCw,
  User,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SupplierLocation {
  stepId: string;
  taskId: string;
  taskTitle: string;
  supplierName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  products: { name: string; qty: number | null }[];
  priority: string;
  dueDate: string | null;
  assignedTo: string | null;
  stepType: string;
}

interface OperationsRouteMapProps {
  userId: string;
  userName: string;
  mapboxToken: string;
  operationsUsers: Array<{ id: string; full_name: string | null; email: string }>;
}

// Dubai coordinates
const DUBAI_CENTER: [number, number] = [55.2708, 25.2048];

// Known supplier locations (can be expanded)
const KNOWN_LOCATIONS: Record<string, [number, number]> = {
  'deira': [55.3247, 25.2744],
  'bur dubai': [55.3033, 25.2533],
  'satwa': [55.2783, 25.2356],
  'karama': [55.2989, 25.2461],
  'jumeirah': [55.2325, 25.2100],
  'marina': [55.1400, 25.0800],
  'downtown': [55.2744, 25.1972],
  'business bay': [55.2636, 25.1850],
  'al quoz': [55.2167, 25.1500],
  'jebel ali': [55.0272, 24.9857],
  'sharjah': [55.4033, 25.3463],
  'ajman': [55.5136, 25.4052],
};

const getLocationFromAddress = (address: string | null): [number, number] | null => {
  if (!address) return null;
  const lower = address.toLowerCase();
  for (const [area, coords] of Object.entries(KNOWN_LOCATIONS)) {
    if (lower.includes(area)) {
      // Add slight randomization to prevent overlap
      return [
        coords[0] + (Math.random() - 0.5) * 0.02,
        coords[1] + (Math.random() - 0.5) * 0.02
      ];
    }
  }
  return null;
};

export const OperationsRouteMap = ({ 
  userId, 
  userName,
  mapboxToken,
  operationsUsers 
}: OperationsRouteMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  
  const [suppliers, setSuppliers] = useState<SupplierLocation[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(false);
  const [assigningStep, setAssigningStep] = useState<string | null>(null);

  const {
    latitude,
    longitude,
    isTracking,
    startTracking,
  } = useGeolocation(userId, {
    enableHighAccuracy: true,
    updateInterval: 5000,
  });

  const currentUser = operationsUsers.find(u => u.id === userId);

  // Fetch collection tasks
  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      
      const { data: stepsData, error } = await supabase
        .from('task_workflow_steps')
        .select(`
          id, step_type, supplier_name, status, location_address, location_lat, location_lng, task_id, assigned_to,
          tasks!inner (id, title, client_name, priority, due_date, deleted_at, status)
        `)
        .is('tasks.deleted_at', null)
        .eq('tasks.status', 'production')
        .eq('status', 'pending')
        .in('step_type', ['collect', 'supplier_to_supplier']);

      if (error) throw error;

      // Fetch products
      const taskIds = [...new Set((stepsData || []).map((s: any) => s.task_id))];
      let productsMap: Record<string, { name: string; qty: number | null }[]> = {};
      
      if (taskIds.length > 0) {
        const { data: productsData } = await supabase
          .from('task_products')
          .select('task_id, product_name, quantity')
          .in('task_id', taskIds);
        
        (productsData || []).forEach((p: any) => {
          if (!productsMap[p.task_id]) productsMap[p.task_id] = [];
          productsMap[p.task_id].push({ name: p.product_name, qty: p.quantity });
        });
      }

      // Group by supplier
      const supplierMap = new Map<string, SupplierLocation>();
      
      (stepsData || []).forEach((step: any) => {
        const task = step.tasks;
        if (!task) return;
        
        const supplierKey = step.supplier_name?.toLowerCase() || 'unknown';
        const existing = supplierMap.get(supplierKey);
        
        // Get location
        let lat = step.location_lat;
        let lng = step.location_lng;
        
        if (!lat || !lng) {
          const coords = getLocationFromAddress(step.location_address);
          if (coords) {
            [lng, lat] = coords;
          }
        }
        
        if (!existing) {
          supplierMap.set(supplierKey, {
            stepId: step.id,
            taskId: step.task_id,
            taskTitle: task.title,
            supplierName: step.supplier_name || 'Unknown',
            address: step.location_address,
            lat,
            lng,
            products: productsMap[step.task_id] || [],
            priority: task.priority,
            dueDate: task.due_date,
            assignedTo: step.assigned_to,
            stepType: step.step_type,
          });
        } else {
          // Merge products from same supplier
          existing.products = [
            ...existing.products,
            ...(productsMap[step.task_id] || [])
          ];
        }
      });

      // Sort by due date
      const sortedSuppliers = Array.from(supplierMap.values()).sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });

      setSuppliers(sortedSuppliers);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
    startTracking();
  }, [fetchSuppliers, startTracking]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    const initMap = () => {
      if (!mapContainer.current) return;
      
      const rect = mapContainer.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        setTimeout(initMap, 100);
        return;
      }

      try {
        mapboxgl.accessToken = mapboxToken;

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: DUBAI_CENTER,
          zoom: 11,
          attributionControl: false,
        });

        map.current.addControl(
          new mapboxgl.NavigationControl({ visualizePitch: true }),
          'bottom-right'
        );

        map.current.on('load', () => {
          setMapReady(true);
        });
      } catch (err) {
        console.error('Error initializing map:', err);
      }
    };

    setTimeout(initMap, 50);

    return () => {
      map.current?.remove();
      map.current = null;
      setMapReady(false);
    };
  }, [mapboxToken]);

  // Update supplier markers
  useEffect(() => {
    if (!mapReady || !map.current) return;

    // Clear old markers
    markers.current.forEach((marker) => marker.remove());
    markers.current.clear();

    // Add supplier markers
    suppliers.forEach((supplier, index) => {
      if (!supplier.lat || !supplier.lng) return;

      const isAssignedToMe = supplier.assignedTo === userId;
      const assignedUser = operationsUsers.find(u => u.id === supplier.assignedTo);
      
      const el = document.createElement('div');
      el.className = 'supplier-marker';
      el.innerHTML = `
        <div class="relative cursor-pointer transform hover:scale-110 transition-transform">
          <div class="w-10 h-10 ${isAssignedToMe ? 'bg-green-500' : supplier.assignedTo ? 'bg-orange-500' : 'bg-blue-600'} rounded-full border-4 border-white shadow-lg flex items-center justify-center text-white font-bold text-sm">
            ${index + 1}
          </div>
          ${supplier.priority === 'urgent' ? '<div class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>' : ''}
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div class="p-2 min-w-48">
          <div class="font-bold text-base">${supplier.supplierName}</div>
          ${supplier.address ? `<p class="text-xs text-gray-500 mt-1">${supplier.address}</p>` : ''}
          <div class="mt-2 flex flex-wrap gap-1">
            ${supplier.products.slice(0, 3).map(p => `<span class="text-xs bg-gray-100 px-1.5 py-0.5 rounded">${p.name}${p.qty ? ` (${p.qty})` : ''}</span>`).join('')}
          </div>
          ${supplier.assignedTo ? `<p class="text-xs mt-2 ${isAssignedToMe ? 'text-green-600 font-semibold' : 'text-orange-600'}">
            ${isAssignedToMe ? '✓ Assigned to you' : `Assigned to ${assignedUser?.full_name || 'other'}`}
          </p>` : '<p class="text-xs mt-2 text-gray-400">Unassigned</p>'}
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([supplier.lng, supplier.lat])
        .setPopup(popup)
        .addTo(map.current!);

      markers.current.set(supplier.stepId, marker);
    });

    // Fit bounds if we have markers
    if (suppliers.length > 0) {
      const validSuppliers = suppliers.filter(s => s.lat && s.lng);
      if (validSuppliers.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        validSuppliers.forEach(s => bounds.extend([s.lng!, s.lat!]));
        
        if (latitude && longitude) {
          bounds.extend([longitude, latitude]);
        }
        
        map.current.fitBounds(bounds, { padding: 60 });
      }
    }
  }, [mapReady, suppliers, userId, operationsUsers, latitude, longitude]);

  // Update user marker
  useEffect(() => {
    if (!mapReady || !map.current || !latitude || !longitude) return;

    if (!userMarker.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="relative">
          <div class="absolute -inset-3 bg-primary/20 rounded-full animate-ping"></div>
          <div class="w-8 h-8 bg-primary rounded-full border-4 border-white shadow-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white">
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
        </div>
      `;

      userMarker.current = new mapboxgl.Marker(el)
        .setLngLat([longitude, latitude])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>You</strong>'))
        .addTo(map.current);
    } else {
      userMarker.current.setLngLat([longitude, latitude]);
    }
  }, [mapReady, latitude, longitude]);

  const handleAssignToMe = async (stepId: string) => {
    setAssigningStep(stepId);
    try {
      const { error } = await supabase
        .from('task_workflow_steps')
        .update({ assigned_to: userId })
        .eq('id', stepId);
      
      if (error) throw error;
      toast.success('Assigned to you!');
      fetchSuppliers();
    } catch (error) {
      console.error('Error assigning:', error);
      toast.error('Failed to assign');
    } finally {
      setAssigningStep(null);
    }
  };

  const handleUnassign = async (stepId: string) => {
    setAssigningStep(stepId);
    try {
      const { error } = await supabase
        .from('task_workflow_steps')
        .update({ assigned_to: null })
        .eq('id', stepId);
      
      if (error) throw error;
      toast.success('Unassigned');
      fetchSuppliers();
    } catch (error) {
      console.error('Error unassigning:', error);
      toast.error('Failed to unassign');
    } finally {
      setAssigningStep(null);
    }
  };

  const centerOnMe = () => {
    if (latitude && longitude && map.current) {
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: 14,
        duration: 800,
      });
    }
  };

  const myTasks = suppliers.filter(s => s.assignedTo === userId);
  const unassignedTasks = suppliers.filter(s => !s.assignedTo);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {/* Map */}
      <div ref={mapContainer} className="flex-1 min-h-[300px]" />

      {/* Floating Controls */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-600 text-white shadow">
            <Factory className="h-3 w-3 mr-1" />
            {suppliers.length} Suppliers
          </Badge>
          <Badge className="bg-green-600 text-white shadow">
            <User className="h-3 w-3 mr-1" />
            {myTasks.length} Mine
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="secondary" className="h-8 w-8 shadow" onClick={fetchSuppliers}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="secondary" className="h-8 w-8 shadow" onClick={centerOnMe}>
            <Locate className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Collapsible Task List */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 bg-background border-t rounded-t-2xl shadow-lg transition-all duration-300",
        showList ? "h-[60%]" : "h-auto"
      )}>
        {/* Handle */}
        <button 
          onClick={() => setShowList(!showList)}
          className="w-full py-2 flex items-center justify-center"
        >
          <div className="w-12 h-1 bg-muted-foreground/30 rounded-full" />
        </button>

        {/* Header */}
        <div className="px-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">My Route</span>
            <Badge variant="secondary">{myTasks.length}</Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowList(!showList)}
            className="h-7"
          >
            {showList ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>

        {/* Task List */}
        {showList && (
          <ScrollArea className="h-[calc(100%-60px)] px-4 pb-4">
            {/* My Assigned Tasks */}
            {myTasks.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-green-600 mb-2">📍 YOUR STOPS</p>
                {myTasks.map((supplier, idx) => (
                  <Card key={supplier.stepId} className="mb-2 border-l-4 border-l-green-500">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{supplier.supplierName}</p>
                            <p className="text-xs text-muted-foreground">{supplier.products.length} items</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {supplier.address && (
                            <Button 
                              size="icon" 
                              variant="outline" 
                              className="h-7 w-7"
                              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(supplier.address!)}`, '_blank')}
                            >
                              <Navigation className="h-3 w-3" />
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-7 text-xs text-red-600"
                            onClick={() => handleUnassign(supplier.stepId)}
                            disabled={assigningStep === supplier.stepId}
                          >
                            {assigningStep === supplier.stepId ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Unassigned Tasks */}
            {unassignedTasks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">📋 UNASSIGNED</p>
                {unassignedTasks.map((supplier) => (
                  <Card key={supplier.stepId} className="mb-2 border-l-4 border-l-blue-500">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{supplier.supplierName}</p>
                          <p className="text-xs text-muted-foreground">{supplier.products.length} items • {supplier.address || 'No address'}</p>
                        </div>
                        <Button 
                          size="sm" 
                          className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                          onClick={() => handleAssignToMe(supplier.stepId)}
                          disabled={assigningStep === supplier.stepId}
                        >
                          {assigningStep === supplier.stepId ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Take'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {myTasks.length === 0 && unassignedTasks.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle2 className="h-12 w-12 text-green-500/50 mx-auto mb-2" />
                <p className="text-sm font-medium">All done!</p>
              </div>
            )}
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
