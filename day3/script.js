let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

function searchNotes(term){
    return notes.filter((note) => note.text.toLowerCase().includes(term.toLowerCase()));
}
console.log(searchNotes("study"));

function longestNote(){
    return notes.reduce((longest, note) => {
        return note.text.length > longest.text.length ? note : longest;
    }, notes[0]);
}
console.log(longestNote());

function countByCategory(){
    return notes.reduce((counts, note) => {
        counts[note.category] = (counts[note.category] || 0) + 1;
        return counts;
    }, {});
}
console.log(countByCategory());

function getSummary() {
    return {
        total: notes.length,
        byCategory: countByCategory(),
        longest: longestNote()
    }

}
console.log(getSummary());

function isDuplicate(text) {
    return notes.some((note) => note.text.toLowerCase() === text.toLowerCase());
}

function addNote(text, category){
    if(isDuplicate(text)){
        console.log("Note already exists");
        return;
    }
    const newNote = {
        id: Date.now(),
        text: text.trim(),
        category: category,
        createdAt: new Date().toLocaleString(),
    };
    notes.push(newNote);
    console.log("Note added successfully");
}
addNote("Buy milk and bread", "personal");

// TEST SUITE (console.log calls)
console.log(notes.length)
console.log(countByCategory())

function sortByText() {
    notes.sort((a,b) => a.text.localeCompare(b.text));
}
sortByText();

console.log(notes)

// RUN THESE IN THE CONSOLE TO TEST ( one at a time )
// addNote ("Buy milk and bread", "personal");
// sortByText();
// console.log(notes.length)
// console.log(countByCategory()) // { personal: 2, study: 2, work: 1 }
// console.log(getSummary())
// console.log(isDuplicate("Buy milk and bread")) // true
// console.log(isDuplicate("Buy eggs")) // false
// console.log(searchNotes("study")) // [ { id: 2, text: 'Finish the Day 3 assignment', category: 'study' }, { id: 4, text: 'Revise JavaScript arrays', category: 'study' } ]