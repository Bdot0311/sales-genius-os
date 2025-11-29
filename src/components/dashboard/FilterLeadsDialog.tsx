import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";

export interface LeadFilters {
  source?: string;
  industry?: string;
  company_size?: string;
  min_score?: number;
  max_score?: number;
}

interface FilterLeadsDialogProps {
  onApplyFilters: (filters: LeadFilters) => void;
  currentFilters: LeadFilters;
}

export const FilterLeadsDialog = ({ onApplyFilters, currentFilters }: FilterLeadsDialogProps) => {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<LeadFilters>(currentFilters);

  const handleApply = () => {
    onApplyFilters(filters);
    setOpen(false);
  };

  const handleReset = () => {
    setFilters({});
    onApplyFilters({});
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter Leads</DialogTitle>
          <DialogDescription>
            Apply advanced filters to find specific leads
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="source">Source</Label>
            <Select value={filters.source} onValueChange={(value) => setFilters({ ...filters, source: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="Apollo">Apollo</SelectItem>
                <SelectItem value="Crunchbase">Crunchbase</SelectItem>
                <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                <SelectItem value="Website">Website</SelectItem>
                <SelectItem value="Manual">Manual</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="industry">Industry</Label>
            <Select value={filters.industry} onValueChange={(value) => setFilters({ ...filters, industry: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All industries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All industries</SelectItem>
                <SelectItem value="Technology">Technology</SelectItem>
                <SelectItem value="Healthcare">Healthcare</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                <SelectItem value="Retail">Retail</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="company_size">Company Size</Label>
            <Select value={filters.company_size} onValueChange={(value) => setFilters({ ...filters, company_size: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All sizes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sizes</SelectItem>
                <SelectItem value="1-10">1-10</SelectItem>
                <SelectItem value="11-50">11-50</SelectItem>
                <SelectItem value="51-200">51-200</SelectItem>
                <SelectItem value="201-500">201-500</SelectItem>
                <SelectItem value="501-1000">501-1000</SelectItem>
                <SelectItem value="1000+">1000+</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="min_score">Min ICP Score</Label>
              <Input
                id="min_score"
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={filters.min_score || ""}
                onChange={(e) => setFilters({ ...filters, min_score: parseInt(e.target.value) || undefined })}
              />
            </div>
            <div>
              <Label htmlFor="max_score">Max ICP Score</Label>
              <Input
                id="max_score"
                type="number"
                min="0"
                max="100"
                placeholder="100"
                value={filters.max_score || ""}
                onChange={(e) => setFilters({ ...filters, max_score: parseInt(e.target.value) || undefined })}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleApply} className="flex-1">
              Apply Filters
            </Button>
            <Button onClick={handleReset} variant="outline">
              Reset
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
