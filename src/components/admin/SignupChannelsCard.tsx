/**
 * Self-reported acquisition: what new users answer to "Where did you find
 * OutReign?" in the signup questionnaire. Unlike the visitor log this survives
 * referrer stripping, so it's the only honest read on word-of-mouth channels.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

type ChannelRow = { channel: string; signups: number; last_signup: string | null };

export const SignupChannelsCard = () => {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_signup_channels");
    if (error) {
      toast.error(`Could not load signup channels: ${error.message}`);
      setRows([]);
    } else {
      setRows((data ?? []) as ChannelRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const total = rows.reduce((sum, r) => sum + Number(r.signups), 0);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Signup channels</CardTitle>
          <CardDescription>
            Answers to "Where did you find OutReign?" — {total} answered so far.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead className="text-right">Signups</TableHead>
              <TableHead className="text-right">Share</TableHead>
              <TableHead>Most recent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  {loading ? "Loading…" : "No answers yet."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.channel}>
                <TableCell className="font-medium">{r.channel}</TableCell>
                <TableCell className="text-right tabular-nums">{r.signups}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {total ? Math.round((Number(r.signups) / total) * 100) : 0}%
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.last_signup ? new Date(r.last_signup).toLocaleDateString() : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
