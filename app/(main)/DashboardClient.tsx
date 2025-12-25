'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import OverviewCards from '../components/dashboard/OverviewCards';
import ActionItems from '../components/dashboard/ActionItems';
import HumanTakeoverCard from '../components/dashboard/HumanTakeoverCard';
import ConversionMetric from '../components/dashboard/ConversionMetric';
import DashboardShell from '../components/dashboard/DashboardShell';
import DashboardTabs from '../components/dashboard/DashboardTabs';
import HumanTakeoverPage from '../components/dashboard/HumanTakeoverPage';
import EcommerceDashboard from '../components/dashboard/ecommerce/EcommerceDashboard';
import LeadDetailsModal from './pipeline/components/LeadDetailsModal';
import type { DashboardData, FlaggedLead, EcommerceMetrics, OverviewMetrics } from '../lib/dashboardData';

interface DashboardClientProps {
    initialData: DashboardData;
    initialEcommerceMetrics?: EcommerceMetrics | null;
}

export default function DashboardClient({ initialData, initialEcommerceMetrics }: DashboardClientProps) {
    const [selectedLead, setSelectedLead] = useState<{ id: string; data: any } | null>(null);
    const [metrics, setMetrics] = useState(initialData.metrics);
    const [status, setStatus] = useState(initialData.status);
    const [flaggedLeads, setFlaggedLeads] = useState<FlaggedLead[]>(initialData.flaggedLeads);
    const [activeSessions, setActiveSessions] = useState(initialData.activeSessions);
    const [overviewMetrics, setOverviewMetrics] = useState<OverviewMetrics | null>(initialData.overviewMetrics);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('Overview');

    const storeType = metrics?.store?.type;

    // Refresh data client-side (for real-time updates)
    const refreshData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const [metricsRes, statusRes, leadsRes, sessionsRes] = await Promise.all([
                fetch('/api/dashboard/metrics'),
                fetch('/api/dashboard/status'),
                fetch('/api/leads/needs-attention'),
                fetch('/api/leads/active-sessions'),
            ]);

            if (metricsRes.ok) {
                const data = await metricsRes.json();
                setMetrics(data);
            }
            if (statusRes.ok) {
                const data = await statusRes.json();
                setStatus(data);
            }
            if (leadsRes.ok) {
                const data = await leadsRes.json();
                setFlaggedLeads(data.leads || []);
            }
            if (sessionsRes.ok) {
                const data = await sessionsRes.json();
                setActiveSessions(data.activeSessions || {});
            }
        } catch (error) {
            console.error('Error refreshing dashboard:', error);
        } finally {
            setIsRefreshing(false);
        }
    }, []);

    // Poll for updates every 60 seconds (client-side only)
    useEffect(() => {
        const interval = setInterval(refreshData, 60000);
        return () => clearInterval(interval);
    }, [refreshData]);

    const handleLeadClick = (leadId: string, leadData: any) => {
        setSelectedLead({ id: leadId, data: leadData });
    };

    // Handlers for ActionItems refresh
    const handleActionItemsRefresh = async () => {
        try {
            const res = await fetch('/api/dashboard/status');
            if (res.ok) {
                setStatus(await res.json());
            }
        } catch (error) {
            console.error('Error refreshing status:', error);
        }
    };

    // Handlers for HumanTakeoverCard
    const handleTakeoverRefresh = async () => {
        try {
            const [leadsRes, sessionsRes] = await Promise.all([
                fetch('/api/leads/needs-attention'),
                fetch('/api/leads/active-sessions'),
            ]);
            if (leadsRes.ok) {
                const data = await leadsRes.json();
                setFlaggedLeads(data.leads || []);
            }
            if (sessionsRes.ok) {
                const data = await sessionsRes.json();
                setActiveSessions(data.activeSessions || {});
            }
        } catch (error) {
            console.error('Error refreshing takeover data:', error);
        }
    };

    const handleUpdateFlaggedLeads = (leads: FlaggedLead[]) => {
        setFlaggedLeads(leads);
    };

    const handleUpdateActiveSessions = (sessions: Record<string, number>) => {
        setActiveSessions(sessions);
    };

    // Render E-commerce Dashboard
    const renderEcommerceDashboard = () => (
        <EcommerceDashboard
            initialMetrics={initialEcommerceMetrics || null}
            initialStatus={status}
            initialFlaggedLeads={flaggedLeads}
            initialActiveSessions={activeSessions}
            onLeadClick={handleLeadClick}
        />
    );

    // Render Overview content (default dashboard)
    const renderOverviewContent = () => (
        <div className="grid grid-cols-12 grid-rows-2 gap-6 h-full min-h-[600px]">
            {/* Top Left: Sales Statistics - Spans 7 cols */}
            <div className="col-span-12 md:col-span-7 row-span-1">
                <OverviewCards data={overviewMetrics} />
            </div>

            {/* Top Right: Action Items - Spans 5 cols */}
            <div className="col-span-12 md:col-span-5 row-span-1">
                <ActionItems
                    initialStatus={status}
                    onRefresh={handleActionItemsRefresh}
                />
            </div>

            {/* Bottom Left: Pipeline Health - Spans 5 cols */}
            <div className="col-span-12 md:col-span-5 row-span-1">
                <ConversionMetric
                    percentage={metrics?.pipeline?.percentage || 0}
                    trend={metrics?.pipeline?.trend}
                    trendValue={metrics?.pipeline?.trendPercentage}
                    isLoading={false}
                />
            </div>

            {/* Bottom Right: Human Takeover - Spans 7 cols */}
            <div className="col-span-12 md:col-span-7 row-span-1">
                <div className="flex gap-6 h-full">
                    <HumanTakeoverCard
                        onLeadClick={handleLeadClick}
                        initialLeads={flaggedLeads}
                        initialSessions={activeSessions}
                        onRefresh={handleTakeoverRefresh}
                        onUpdateLeads={handleUpdateFlaggedLeads}
                        onUpdateSessions={handleUpdateActiveSessions}
                    />
                </div>
            </div>
        </div>
    );

    // Render Human Takeover full page
    const renderHumanTakeoverContent = () => (
        <HumanTakeoverPage
            onLeadClick={handleLeadClick}
            initialLeads={flaggedLeads}
            initialSessions={activeSessions}
            onRefresh={handleTakeoverRefresh}
            onUpdateLeads={handleUpdateFlaggedLeads}
            onUpdateSessions={handleUpdateActiveSessions}
        />
    );

    // Render Default/Fallback Dashboard with tabs
    const renderDefaultDashboard = () => (
        <div className="flex flex-col h-full">
            <DashboardTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                humanTakeoverCount={flaggedLeads.length}
            />
            {activeTab === 'Overview' ? renderOverviewContent() : renderHumanTakeoverContent()}
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-[var(--background)]">
            <Header />
            <div className="flex-1 overflow-hidden">
                <DashboardShell>
                    {storeType === 'ecommerce' ? renderEcommerceDashboard() : renderDefaultDashboard()}
                </DashboardShell>
            </div>

            {/* Lead Details Modal */}
            <LeadDetailsModal
                isOpen={!!selectedLead}
                onClose={() => setSelectedLead(null)}
                leadId={selectedLead?.id || null}
                initialLeadData={selectedLead?.data}
            />
        </div>
    );
}

