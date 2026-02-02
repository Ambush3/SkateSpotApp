import React, { useEffect, useState } from 'react';
import {SafeAreaView, Text, View, Button, ScrollView, Platform, Modal, TextInput, Pressable, Alert} from 'react-native';
import MapView, {Marker, Region, LongPressEvent, Callout} from 'react-native-maps';
import { supabase } from '@/src/libs/supabase';

type Spot = {
    id: string;
    name: string;
    description: string | null;
    lat: number;
    lng: number;
    created_at: string;
};

const GRAND_RAPIDS: Region = {
    latitude: 42.9634,
    longitude: -85.6681,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
};

export default function Index() {
    const [spots, setSpots] = useState<Spot[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [region, setRegion] = useState<Region>(GRAND_RAPIDS);
    const [loading, setLoading] = useState(false);

    const [createOpen, setCreateOpen] = useState(false);
    const [pendingCoord, setPendingCoord] = useState<{ lat: number; lng: number } | null>(null);

    const [spotName, setSpotName] = useState('');
    const [spotDesc, setSpotDesc] = useState('');

    async function reload() {
        setError(null);
        setLoading(true);

        const { data, error } = await supabase
            .from('spots')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);

        setLoading(false);

        if (error) {
            setError(error.message);
            return;
        }
        setSpots((data ?? []) as Spot[]);
    }

    async function createSpotAt(lat: number, lng: number, name: string, description?: string) {
        setError(null);

        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('Name is required');
            return;
        }

        const { data, error } = await supabase
            .from('spots')
            .insert({
                name: trimmedName,
                description: (description ?? '').trim() || null,
                lat,
                lng,
            })
            .select()
            .single();

        if (error) {
            setError(error.message);
            return;
        }

        if (data) setSpots((prev) => [data as Spot, ...prev]);
    }

    async function deleteSpotById(id: string) {
        setError(null);

        const { error } = await supabase.from('spots').delete().eq('id', id);

        if (error) {
            setError(error.message);
            return;
        }

        setSpots((prev) => prev.filter((s) => s.id !== id));
    }

    function confirmDelete(spot: Spot) {
        Alert.alert(
            'Delete spot?',
            spot.name,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteSpotById(spot.id),
                },
            ]
        );
    }

    function onLongPress(e: LongPressEvent) {
        const { latitude, longitude } = e.nativeEvent.coordinate;

        setPendingCoord({ lat: latitude, lng: longitude });
        setSpotName('');
        setSpotDesc('');
        setCreateOpen(true);
    }

    useEffect(() => {
        reload();
    }, []);

    if (Platform.OS === 'web') {
        return (
            <SafeAreaView style={{ flex: 1, padding: 16 }}>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                    <Button title={loading ? 'Loading…' : 'Reload'} onPress={reload} />
                </View>

                {error ? <Text style={{ color: 'red', marginBottom: 12 }}>{error}</Text> : null}
                <Text style={{ marginBottom: 12 }}>
                    Map is native-only for now. Web shows a list fallback.
                </Text>

                <ScrollView>
                    {spots.map((s) => (
                        <View key={s.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#ddd' }}>
                            <Text style={{ fontWeight: '600' }}>{s.name}</Text>
                            {s.description ? <Text>{s.description}</Text> : null}
                            <Text>{s.lat}, {s.lng}</Text>
                            <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                                <Button title="Delete" onPress={() => confirmDelete(s)} />
                            </View>
                        </View>
                    ))}
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1 }}>
            <View style={{ padding: 12, flexDirection: 'row', gap: 12 }}>
                <Button title={loading ? 'Loading…' : 'Reload'} onPress={reload} />
            </View>

            {error ? <Text style={{ color: 'red', paddingHorizontal: 12 }}>{error}</Text> : null}

            <Modal
                visible={createOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setCreateOpen(false)}
            >
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }}
                    onPress={() => setCreateOpen(false)}
                >
                    <Pressable
                        style={{ backgroundColor: 'white', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
                        onPress={() => {}}
                    >
                        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Create spot</Text>

                        {pendingCoord ? (
                            <Text style={{ marginBottom: 12 }}>
                                {pendingCoord.lat.toFixed(5)}, {pendingCoord.lng.toFixed(5)}
                            </Text>
                        ) : null}

                        <Text style={{ marginBottom: 6 }}>Name</Text>
                        <TextInput
                            value={spotName}
                            onChangeText={setSpotName}
                            placeholder="e.g. Downtown ledges"
                            autoFocus
                            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 12 }}
                        />

                        <Text style={{ marginBottom: 6 }}>Description (optional)</Text>
                        <TextInput
                            value={spotDesc}
                            onChangeText={setSpotDesc}
                            placeholder="Surface, obstacles, best time to skate, etc."
                            multiline
                            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, height: 90, marginBottom: 12 }}
                        />

                        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
                            <Button title="Cancel" onPress={() => setCreateOpen(false)} />
                            <Button
                                title="Create"
                                onPress={async () => {
                                    if (!pendingCoord) return;
                                    await createSpotAt(pendingCoord.lat, pendingCoord.lng, spotName, spotDesc);
                                    setCreateOpen(false);
                                }}
                            />
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <MapView
                style={{ flex: 1 }}
                onRegionChangeComplete={setRegion}
                onLongPress={onLongPress}
            >
                {spots.map((s) => (
                    <Marker
                        key={s.id}
                        coordinate={{ latitude: s.lat, longitude: s.lng }}
                    >
                        <Callout onPress={() => confirmDelete(s)}>
                            <View style={{ maxWidth: 220 }}>
                                <Text style={{ fontWeight: '600' }}>{s.name}</Text>
                                {s.description ? <Text>{s.description}</Text> : null}
                                <Text style={{ marginTop: 8, color: 'red' }}>Tap to delete</Text>
                            </View>
                        </Callout>
                    </Marker>
                ))}
            </MapView>
        </SafeAreaView>
    );
}