export const WhyThisExists = () => {
  return (
    <section className="py-16 sm:py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">
            Why we built this
          </h2>
          
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Most sales tools are built for sales managers who need dashboards and reports. 
              They're not built for the person who actually has to book meetings.
            </p>
            
            <p>
              When you're doing outbound, you need three things: a way to find leads, 
              a way to contact them, and a way to track what happens next. 
              That's it.
            </p>
            
            <p>
              Instead, you end up with a CRM that's really just a database, a separate tool for lead data, 
              another tool for email sequences, and a spreadsheet to tie it all together. 
              You spend more time moving data between tools than actually selling.
            </p>
            
            <p>
              SalesOS puts all of that in one place. 
              Search for leads, send emails, track deals. 
              The data flows through automatically. 
              You just focus on the conversations.
            </p>
            
            <p className="text-foreground font-medium">
              We built the tool we wished we had when we were running outbound ourselves.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
