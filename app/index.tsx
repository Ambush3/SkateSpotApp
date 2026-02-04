import React, { useEffect, useState, useRef } from 'react';
import {Text, View, Button, ScrollView, Platform, Modal, TextInput, Pressable, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import MapView, {Marker, Region, LongPressEvent} from 'react-native-maps';
import { supabase } from '@/src/libs/supabase';
import * as Location from "expo-location";

type Spot = {
    id: string;
    name: string;
    description: string | null;
    lat: number;
    lng: number;
    created_at: string;
};

type Review = {
    id: string;
    spot_id: string;
    rating: number;
    // comment: string | null;
    created_at: string;
};

type Place = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    tags?: Record<string, string>;
};

const GRAND_RAPIDS: Region = {
    latitude: 42.9634,
    longitude: -85.6681,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
};

export default function Index() {
    const mapRef = useRef<MapView | null>(null);

    const [places, setPlaces] = useState<Place[]>([]);
    const [placesLoading, setPlacesLoading] = useState(false);

    const [spots, setSpots] = useState<Spot[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [region, setRegion] = useState<Region>(GRAND_RAPIDS);
    const [loading, setLoading] = useState(false);
    const [spotRating, setSpotRating] = useState(0);

    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
    const [spotReviews, setSpotReviews] = useState<Review[]>([]);

    const [newReviewRating, setNewReviewRating] = useState(0);
    const [newReviewComment, setNewReviewComment] = useState('');

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

    async function createSpotAt(
        lat: number,
        lng: number,
        name: string,
        description?: string,
        initialRating?: number
    ) {
        setError(null);

        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('Name is required');
            return;
        }

        const { data: spotData, error: spotErr } = await supabase
            .from('spots')
            .insert({
                name: trimmedName,
                description: (description ?? '').trim() || null,
                lat,
                lng,
            })
            .select()
            .single();

        if (spotErr) {
            setError(spotErr.message);
            return;
        }

        const spot = spotData as Spot;

        if ((initialRating ?? 0) > 0) {
            const { error: reviewErr } = await supabase.from('reviews').insert({
                spot_id: spot.id,
                rating: initialRating,
            });

            if (reviewErr) {
                setError(reviewErr.message);
            }
        }

        setSpots((prev) => [spot, ...prev]);
    }

    async function deleteSpotById(id: string) {
        setError(null);

        const { error } = await supabase.from('spots').delete().eq('id', id);

        if (error) {
            setError(error.message);
            return;
        }

        setSpots((prev) => prev.filter((s) => s.id !== id));

        if (selectedSpot?.id === id) {
            setDetailsOpen(false);
            setSelectedSpot(null);
            setSpotReviews([]);
        }
    }

    async function loadReviews(spotId: string) {
        const { data, error } = await supabase
            .from('reviews')
            .select('*')
            .eq('spot_id', spotId)
            .order('created_at', { ascending: false });

        if (error) {
            setError(error.message);
            return;
        }
        setSpotReviews((data ?? []) as Review[]);
    }

    const avgRating =
        spotReviews.length === 0
            ? 0
            : spotReviews.reduce((sum, r) => sum + r.rating, 0) / spotReviews.length;

    async function openSpotDetails(spot: Spot) {
        setSelectedSpot(spot);
        setDetailsOpen(true);
        setSpotReviews([]);

        setNewReviewRating(0);
        setNewReviewComment('');

        await loadReviews(spot.id);
    }

    async function addReviewForSelectedSpot() {
        if (!selectedSpot) return;

        setError(null);

        if (newReviewRating <= 0) {
            setError('Please choose a rating.');
            return;
        }

        const { error } = await supabase.from('reviews').insert({
            spot_id: selectedSpot.id,
            rating: newReviewRating,
            // comment: newReviewComment.trim() || null,
        });

        if (error) {
            setError(error.message);
            return;
        }

        setNewReviewRating(0);
        setNewReviewComment('');

        await loadReviews(selectedSpot.id);
    }

    async function loadNearbySkateShops(radiusMeters = 8000) {
        if (Platform.OS === "web") {
            setError("Nearby search is native-only for now.");
            return;
        }

        setError(null);
        setPlacesLoading(true);

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                setError("Location permission denied.");
                return;
            }

            const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            const query = `
      [out:json][timeout:25];
      (
        node(around:${radiusMeters},${lat},${lng})["shop"="skate"];
        way(around:${radiusMeters},${lat},${lng})["shop"="skate"];
        relation(around:${radiusMeters},${lat},${lng})["shop"="skate"];

        node(around:${radiusMeters},${lat},${lng})["sport"="skateboarding"]["shop"];
        way(around:${radiusMeters},${lat},${lng})["sport"="skateboarding"]["shop"];
        relation(around:${radiusMeters},${lat},${lng})["sport"="skateboarding"]["shop"];

        node(around:${radiusMeters},${lat},${lng})["leisure"="skate_park"];
        way(around:${radiusMeters},${lat},${lng})["leisure"="skate_park"];
        relation(around:${radiusMeters},${lat},${lng})["leisure"="skate_park"];
      );
      out center tags;
    `.trim();

            const resp = await fetch("https://overpass-api.de/api/interpreter", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body: `data=${encodeURIComponent(query)}`,
            });

            if (!resp.ok) throw new Error(`Overpass error: HTTP ${resp.status}`);

            const json = await resp.json();

            const normalized: Place[] = (json.elements ?? [])
                .map((el: any) => {
                    const pLat = el.lat ?? el.center?.lat;
                    const pLng = el.lon ?? el.center?.lon;
                    if (typeof pLat !== "number" || typeof pLng !== "number") return null;

                    const name =
                        el.tags?.name ??
                        (el.tags?.leisure === "skate_park" ? "Skate park" : "Skate shop");

                    return {
                        id: `${el.type}-${el.id}`,
                        name,
                        lat: pLat,
                        lng: pLng,
                        tags: el.tags ?? {},
                    } as Place;
                })
                .filter(Boolean);

            setPlaces(normalized);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load nearby places.");
        } finally {
            setPlacesLoading(false);
        }
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

    function Stars({
                       value,
                       onChange,
                       size = 26,
                       disabled = false,
                   }: {
        value: number;
        onChange: (v: number) => void;
        size?: number;
        disabled?: boolean;
    }) {
        return (
            <View style={{ flexDirection: 'row', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable
                        key={n}
                        disabled={disabled}
                        onPress={() => onChange(n)}
                        hitSlop={8}
                    >
                        <Text style={{ fontSize: size }}>
                            {n <= value ? '★' : '☆'}
                        </Text>
                    </Pressable>
                ))}
            </View>
        );
    }

    function onLongPress(e: LongPressEvent) {
        const { latitude, longitude } = e.nativeEvent.coordinate;

        setPendingCoord({ lat: latitude, lng: longitude });
        setSpotName('');
        setSpotDesc('');
        setCreateOpen(true);
        setSpotRating(0);
    }

    useEffect(() => {
        reload();
    }, []);

    useEffect(() => {
        (async () => {
            if (Platform.OS === "web") return;

            setError(null);

            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                setError("Location permission denied.");
                return;
            }

            const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const latitude = pos.coords.latitude;
            const longitude = pos.coords.longitude;

            const nextRegion: Region = {
                latitude,
                longitude,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
            };

            // Move the map camera
            mapRef.current?.animateToRegion(nextRegion, 600);

            // Optional: keep your state in sync
            setRegion(nextRegion);
        })();
    }, []);

    if (Platform.OS === 'web') {
        return (
            <SafeAreaView style={{ flex: 1, padding: 16 }}>
                {/*<View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>*/}
                {/*    <Button title={loading ? 'Loading…' : 'Reload'} onPress={reload} />*/}
                {/*</View>*/}

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
            {/*<View style={{ padding: 12, flexDirection: 'row', gap: 12 }}>*/}
            {/*    <Button title={loading ? 'Loading…' : 'Reload'} onPress={login} />*/}
            {/*</View>*/}

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

                        <Text style={{ marginBottom: 6 }}>Rating (optional)</Text>
                        <Stars value={spotRating} onChange={setSpotRating} />

                        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
                            <Button title="Cancel" onPress={() => setCreateOpen(false)} />
                            <Button
                                title="Create"
                                onPress={async () => {
                                    if (!pendingCoord) return;
                                    await createSpotAt(pendingCoord.lat, pendingCoord.lng, spotName, spotDesc, spotRating);
                                    setCreateOpen(false);
                                }}
                            />
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
            <Modal
                visible={detailsOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setDetailsOpen(false)}
            >
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }}
                    onPress={() => setDetailsOpen(false)}
                >
                    <Pressable
                        style={{
                            backgroundColor: 'white',
                            padding: 16,
                            borderTopLeftRadius: 16,
                            borderTopRightRadius: 16,
                            maxHeight: '80%',
                        }}
                        onPress={() => {}}
                    >
                        <Text style={{ fontSize: 18, fontWeight: '600' }}>
                            {selectedSpot?.name ?? 'Spot'}
                        </Text>

                        {selectedSpot?.description ? (
                            <Text style={{ marginTop: 6 }}>{selectedSpot.description}</Text>
                        ) : null}

                        <View style={{ marginTop: 12 }}>
                            <Text style={{ marginBottom: 6, fontWeight: '600' }}>
                                Rating ({spotReviews.length})
                            </Text>

                            <Stars
                                value={Math.round(avgRating)}
                                onChange={() => {}}
                                disabled
                            />

                            <Text style={{ marginTop: 6, opacity: 0.7 }}>
                                {spotReviews.length === 0 ? 'No reviews yet' : avgRating.toFixed(1) + ' / 5'}
                            </Text>
                        </View>

                        <View style={{ marginTop: 16 }}>
                            <Text style={{ fontWeight: '600', marginBottom: 6 }}>Add a review</Text>

                            <Stars value={newReviewRating} onChange={setNewReviewRating} />

                            <TextInput
                                value={newReviewComment}
                                onChangeText={setNewReviewComment}
                                placeholder="Optional comment"
                                multiline
                                style={{
                                    borderWidth: 1,
                                    borderColor: '#ccc',
                                    borderRadius: 8,
                                    padding: 10,
                                    height: 80,
                                    marginTop: 10,
                                }}
                            />

                            <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                                <Button title="Submit review" onPress={addReviewForSelectedSpot} />
                            </View>
                        </View>

                        <View style={{ marginTop: 16 }}>
                            <Text style={{ fontWeight: '600', marginBottom: 8 }}>Reviews</Text>

                            <ScrollView>
                                {spotReviews.map((r) => (
                                    <View key={r.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
                                        <Text>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                                        <Text style={{ marginTop: 4, opacity: 0.6, fontSize: 12 }}>
                                            {new Date(r.created_at).toLocaleString()}
                                        </Text>
                                    </View>
                                ))}
                            </ScrollView>
                        </View>

                        <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Button title="Close" onPress={() => setDetailsOpen(false)} />
                            {selectedSpot ? (
                                <Button
                                    title="Delete spot"
                                    onPress={() => confirmDelete(selectedSpot)}
                                    color="red"
                                />
                            ) : null}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <MapView
                ref={mapRef}
                style={{ flex: 1 }}
                initialRegion={GRAND_RAPIDS}
                onRegionChangeComplete={setRegion}
                onLongPress={onLongPress}
                showsUserLocation
                showsMyLocationButton
            >
            {spots.map((s) => (
                <Marker
                    key={s.id}
                    coordinate={{ latitude: s.lat, longitude: s.lng }}
                    title={s.name}
                    description={s.description ?? undefined}
                    onPress={() => openSpotDetails(s)}
                />
            ))}
            {places.map((p) => (
                <Marker
                    key={p.id}
                    coordinate={{ latitude: p.lat, longitude: p.lng }}
                    title={p.name}
                    description={p.tags?.["addr:city"] ?? p.tags?.website ?? undefined}
                />
            ))}
            </MapView>
        </SafeAreaView>
    );
}