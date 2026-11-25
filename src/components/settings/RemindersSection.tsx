'use client';

import { useState, useEffect } from "react";
import { trpc } from "@/utils/trpc";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { ModalSegmentedControl } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatLagosYMD } from "@/lib/billing";
import { Bell } from "lucide-react";

export function RemindersSection() {
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { data: settings, isLoading } = trpc.reminders.get.useQuery();

  const [enabled, setEnabled] = useState(true);
  const [startOption, setStartOption] = useState("2");
  const [startDate, setStartDate] = useState("");
  const [frequency, setFrequency] = useState<"once" | "weekly" | "monthly">("monthly");

  useEffect(() => {
    if (settings) {
      setEnabled(settings.expiryEnabled);
      setStartOption(settings.expiryStartMode === "date" ? "custom" : String(settings.expiryMonthsBefore));
      setStartDate(settings.expiryStartDate || "");
      setFrequency(settings.expiryFrequency);
    }
  }, [settings]);

  const updateMutation = trpc.reminders.update.useMutation({
    onSuccess: () => {
      utils.reminders.get.invalidate();
      toast("Reminder settings saved", "success");
    },
    onError: (err) => {
      toast(err.message, "error");
    },
  });

  if (isLoading || !settings) {
    return null;
  }

  // Compare with server state to see if modified
  const initialStartOption = settings.expiryStartMode === "date" ? "custom" : String(settings.expiryMonthsBefore);
  const initialStartDate = settings.expiryStartDate || "";
  const initialFrequency = settings.expiryFrequency;
  const initialEnabled = settings.expiryEnabled;

  const hasChanges =
    enabled !== initialEnabled ||
    startOption !== initialStartOption ||
    (startOption === "custom" && startDate !== initialStartDate) ||
    frequency !== initialFrequency;

  const handleSave = async () => {
    const isDateMode = startOption === "custom";
    const months = isDateMode ? 2 : (parseInt(startOption, 10) as 1 | 2 | 3 | 4 | 6);

    await updateMutation.mutateAsync({
      expiryEnabled: enabled,
      expiryStartMode: isDateMode ? "date" : "months",
      expiryMonthsBefore: months,
      expiryStartDate: isDateMode ? startDate : null,
      expiryFrequency: frequency,
    });
  };

  const todayStr = formatLagosYMD(new Date());

  return (
    <div className="rounded-xl border border-border bg-card/40 p-6 backdrop-blur-sm space-y-6">
      <div className="border-b border-border pb-3">
        <div className="flex items-center space-x-2">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">Reminders</h2>
        </div>
        <p className="text-muted-foreground text-xs mt-1">
          Choose when we remind you that your lease is ending.
        </p>
      </div>

      <div className="space-y-6">
        {/* Row 1: Switch */}
        <div className="flex items-center justify-between">
          <label
            htmlFor="lease-ending-reminders"
            className="text-sm font-semibold text-foreground cursor-pointer select-none"
          >
            Lease ending reminders
          </label>
          <Switch
            id="lease-ending-reminders"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Row 2: START REMINDING ME */}
        <div className="space-y-2">
          <label
            htmlFor="start-reminding-select"
            className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            START REMINDING ME
          </label>
          <Select
            id="start-reminding-select"
            value={startOption}
            disabled={!enabled}
            onChange={(e) => setStartOption(e.target.value)}
            className="h-12 text-sm"
          >
            <option value="1">1 month before the end date</option>
            <option value="2">2 months before</option>
            <option value="3">3 months before</option>
            <option value="4">4 months before</option>
            <option value="6">6 months before</option>
            <option value="custom">On a date I choose</option>
          </Select>

          {startOption === "custom" && (
            <div className="space-y-2 pt-2">
              <label
                htmlFor="reminder-start-date"
                className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                REMINDER START DATE
              </label>
              <input
                id="reminder-start-date"
                type="date"
                disabled={!enabled}
                min={todayStr}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full h-12 rounded-lg field-focus px-4 text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>
          )}
        </div>

        {/* Row 3: HOW OFTEN */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            HOW OFTEN
          </label>
          <ModalSegmentedControl
            disabled={!enabled}
            value={frequency}
            onChange={setFrequency}
            options={[
              { value: "once", label: "Once" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <Button
            type="button"
            size="action"
            disabled={!hasChanges || updateMutation.isPending || (startOption === "custom" && !startDate)}
            onClick={handleSave}
          >
            {updateMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
