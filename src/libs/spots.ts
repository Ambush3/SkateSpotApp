import { supabase } from './supabase';

export type Spot = {
    id: string;
    name: string;
    description: string | null;
    lat: number;
    lng: number;
    created_at: string;
};

export async function listSpots(limit = 100) {
    return supabase
        .from('spots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
}

export async function createSpot(input: { name: string; description?: string; lat: number; lng: number }) {
    return supabase.from('spots').insert({
        name: input.name,
        description: input.description ?? null,
        lat: input.lat,
        lng: input.lng,
    });
}
