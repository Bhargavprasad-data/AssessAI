import re
import json
import logging
from typing import Dict, Any, List, Optional
from app.config import settings

logger = logging.getLogger(__name__)

# Predefined domain definitions with weighted keywords, aliases, and characteristic tokens
DOMAIN_KNOWLEDGE_BASE = [
    {
        "subject": "Data Structures & Algorithms",
        "category": "Core Computer Science",
        "suggested_title": "Data Structures & Algorithms Assessment",
        "icon": "binary",
        "aliases": [
            "Data Structures", "Data Structures and Algorithms", "DSA",
            "Data Structures using C", "Data Structures using C++",
            "Data Structures through C", "Data Structures through Java"
        ],
        "keywords": [
            r"\bdata\s+structures?\b", r"\balgorithms?\b", r"\bbinary\s+search\s+tree\b", r"\blinked\s+lists?\b",
            r"\bstack\b", r"\bqueue\b", r"\bavl\s+trees?\b", r"\bheap\b", r"\bgraphs?\b", r"\bdepth-first\s+search\b",
            r"\bbreadth-first\s+search\b", r"\bbfs\b", r"\bdfs\b", r"\bdijkstra\b", r"\bdynamic\s+programming\b",
            r"\btime\s+complexity\b", r"\bspace\s+complexity\b", r"\bbig-?o\b", r"\bquicksort\b", r"\bmergesort\b",
            r"\brecursion\b", r"\bhash\s+tables?\b", r"\bpseudocode\b", r"\bnode\b", r"\bhead\b",
            r"\btraversal\b", r"\binsertion\b", r"\bdeletion\b", r"\bsparse\s+matrix\b", r"\bpolynomial\b",
            r"\blinear\s+data\s+structures?\b", r"\bnon-?linear\s+data\s+structures?\b", r"\bauxiliary\s+space\b",
            r"\bunderflow\b", r"\boverflow\b"
        ],
        "strong_markers": [
            r"\bdata\s+structures?\b", r"\bdsa\b", r"\blinked\s+lists?\b",
            r"\b(singly|doubly|circular)\s+linked\s+lists?\b", r"\bbinary\s+(?:search\s+)?trees?\b",
            r"\bbst\b", r"\bavl\s+trees?\b", r"\bsparse\s+matrix\b", r"\bpolynomial\s+representation\b",
            r"\btime\s+complexity\b", r"\bspace\s+complexity\b", r"\bquicksort\b", r"\bmergesort\b"
        ],
        "common_subtopics": [
            ("Linked Lists (Singly, Doubly, Circular)", [r"\blinked\s+lists?\b", r"\bsingly\s+linked\b", r"\bdoubly\s+linked\b", r"\bcircular\s+linked\b", r"\bnode\b"]),
            ("Linear Data Structures (Stacks & Queues)", [r"\bstack\b", r"\bqueue\b", r"\bpush\b", r"\bpop\b", r"\bdequeue\b", r"\benqueue\b"]),
            ("Trees & Binary Search Trees (BST)", [r"\bbinary\s+tree\b", r"\bbst\b", r"\bavl\b", r"\btraversal\b", r"\binorder\b", r"\bpreorder\b", r"\bpostorder\b"]),
            ("Graphs & Pathfinding Algorithms", [r"\bgraph\b", r"\bbfs\b", r"\bdfs\b", r"\bdijkstra\b", r"\bspanning\s+tree\b", r"\bkruskal\b", r"\bprims\b"]),
            ("Sorting & Searching Techniques", [r"\bquicksort\b", r"\bmergesort\b", r"\bbinary\s+search\b", r"\blinear\s+search\b", r"\bheapsort\b", r"\bbubble\s+sort\b"]),
            ("Sparse Matrices & Polynomials", [r"\bsparse\s+matrix\b", r"\bpolynomial\b", r"\b2d\s+array\b"]),
            ("Asymptotic Complexity & Analysis", [r"\bbig-?o\b", r"\btime\s+complexity\b", r"\bspace\s+complexity\b", r"\bauxiliary\s+space\b", r"\btheta\b", r"\bomega\b"]),
        ]
    },
    {
        "subject": "Python Programming",
        "category": "Programming Languages",
        "suggested_title": "Python Programming Assessment",
        "icon": "python",
        "aliases": ["Python", "Python 3", "Python Programming Language"],
        "keywords": [
            r"\bpython\b", r"\bdef\s+\w+\s*\(", r"\belif\b", r"\b__init__\b", r"\bself\.\w+",
            r"\bpandas\b", r"\bnumpy\b", r"\blambda\b", r"\blist\s+comprehension\b", r"\bpip\b",
            r"\bpydantic\b", r"\bmatplotlib\b", r"\bflask\b", r"\bdjango\b", r"\bkwargs\b",
            r"\bargs\b", r"\btuple\b", r"\bdictionary\b", r"\bdict\b", r"\bimport\s+sys\b",
            r"\bimport\s+os\b", r"\byield\b", r"\bdecorator\b", r"\bdunder\b", r"\bpep\s*8\b"
        ],
        "strong_markers": [r"\bdef\s+\w+\s*\(", r"\b__init__\b", r"\bself\.", r"\belif\b", r"\bpython\b"],
        "common_subtopics": [
            ("Variables & Data Types", [r"\bvariables\b", r"\bdata\s+types\b", r"\bint\b", r"\bstr\b", r"\bfloat\b", r"\blist\b"]),
            ("Control Flow & Loops", [r"\bfor\s+loop\b", r"\bwhile\s+loop\b", r"\belif\b", r"\bbreak\b", r"\bcontinue\b"]),
            ("Functions & Lambdas", [r"\bdef\s+\w+", r"\blambda\b", r"\breturn\b", r"\barguments\b", r"\bparameters\b"]),
            ("Object-Oriented Programming (OOP)", [r"\bclass\s+\w+", r"\bself\b", r"\b__init__\b", r"\binheritance\b", r"\bpolymorphism\b", r"\bencapsulation\b"]),
            ("Data Structures & Collections", [r"\blist\b", r"\btuple\b", r"\bdict\b", r"\bset\b", r"\bcomprehension\b"]),
            ("Exception Handling", [r"\btry\b", r"\bexcept\b", r"\bfinally\b", r"\braise\b", r"\bexception\b"]),
            ("File Handling & I/O", [r"\bopen\s*\(", r"\bread\s*\(", r"\bwrite\s*\(", r"\bwith\s+open\b"]),
            ("Modules & Packages", [r"\bimport\b", r"\bfrom\s+\w+\s+import\b", r"\b__name__\b", r"\bpip\b"]),
        ]
    },
    {
        "subject": "Java Programming",
        "category": "Programming Languages",
        "suggested_title": "Java Programming Assessment",
        "icon": "java",
        "aliases": ["Java", "Core Java", "Java Programming Language", "OOP through Java"],
        "keywords": [
            r"\bjava\b", r"\bpublic\s+class\b", r"\bpublic\s+static\s+void\s+main\b",
            r"\bSystem\.out\.println\b", r"\bjvm\b", r"\bjdk\b", r"\bjre\b", r"\bextends\b",
            r"\bimplements\b", r"\binterface\b", r"\babstract\s+class\b", r"\bgarbage\s+collection\b",
            r"\bNullPointerException\b", r"\bArrayList\b", r"\bHashMap\b", r"\bbytecode\b",
            r"\bpackage\s+[\w\.]+;", r"\bprivate\b", r"\bprotected\b", r"\bstatic\b", r"\bspring\s+boot\b"
        ],
        "strong_markers": [r"\bpublic\s+static\s+void\s+main\b", r"\bSystem\.out\.", r"\bpublic\s+class\b", r"\bjvm\b"],
        "common_subtopics": [
            ("Core Java Syntax & Basics", [r"\bdata\s+types\b", r"\bvariables\b", r"\boperators\b", r"\btype\s+casting\b"]),
            ("Object-Oriented Programming (OOP)", [r"\bclass\b", r"\bobject\b", r"\binheritance\b", r"\bpolymorphism\b", r"\bencapsulation\b", r"\babstraction\b"]),
            ("Interfaces & Abstract Classes", [r"\binterface\b", r"\bimplements\b", r"\babstract\b"]),
            ("Exception Handling", [r"\btry\b", r"\bcatch\b", r"\bfinally\b", r"\bthrow\b", r"\bthrows\b", r"\bException\b"]),
            ("Java Collections Framework", [r"\bCollection\b", r"\bArrayList\b", r"\bLinkedList\b", r"\bHashSet\b", r"\bHashMap\b", r"\bIterator\b"]),
            ("Multithreading & Concurrency", [r"\bThread\b", r"\bRunnable\b", r"\bsynchronized\b", r"\block\b", r"\bthread\b"]),
            ("JVM Architecture & Memory", [r"\bjvm\b", r"\bheap\b", r"\bstack\b", r"\bgarbage\s+collector\b", r"\bbytecode\b"]),
        ]
    },
    {
        "subject": "C / C++ Programming",
        "category": "Programming Languages",
        "suggested_title": "C / C++ Programming Assessment",
        "icon": "cpp",
        "aliases": ["C Programming", "C++ Programming", "C Language", "C++ Language", "Advanced C"],
        "keywords": [
            r"\bc\+\+\b", r"\bcpp\b", r"#include\s*<stdio\.h>", r"#include\s*<iostream>",
            r"\bstd::cout\b", r"\bstd::cin\b", r"\bprintf\b", r"\bscanf\b", r"\bpointers\b",
            r"\bmalloc\b", r"\bfree\s*\(", r"\bstruct\b", r"\bdestructor\b", r"\boperator\s*[\+\-\*\/]\b",
            r"\bvirtual\s+function\b", r"\btemplate\s*<", r"\bstd::vector\b", r"\bstd::string\b", r"\bnamespace\b"
        ],
        "strong_markers": [
            r"#include\s*<[a-z0-9_.]+>", r"\bstd::cout\b", r"\bstd::cin\b", r"\bc\+\+\b",
            r"\bcpp\b", r"\bnamespace\s+\w+", r"\bvirtual\s+(?:void|int|bool|class)\b",
            r"\btemplate\s*<", r"\bstd::vector\b", r"\bconstexpr\b"
        ],
        "common_subtopics": [
            ("Pointers & Dynamic Memory", [r"\bpointer\b", r"\bmalloc\b", r"\bfree\b", r"\baddress\b", r"\bmemory\s+allocation\b"]),
            ("Structures & Unions", [r"\bstruct\b", r"\bunion\b", r"\btypedef\b"]),
            ("Object-Oriented C++", [r"\bclass\b", r"\bconstructor\b", r"\bdestructor\b", r"\binheritance\b", r"\bvirtual\b"]),
            ("Standard Template Library (STL)", [r"\bstd::vector\b", r"\bstd::map\b", r"\bstd::queue\b", r"\bstd::stack\b", r"\bstl\b", r"\biterator\b"]),
        ]
    },
    {
        "subject": "Operating Systems",
        "category": "Core Computer Science",
        "suggested_title": "Operating Systems Assessment",
        "icon": "cpu",
        "aliases": ["OS", "Operating System Concepts", "Operating Systems Principles"],
        "keywords": [
            r"\boperating\s+system\b", r"\bprocess\s+management\b", r"\bdeadlock\b", r"\bpaging\b",
            r"\bvirtual\s+memory\b", r"\bsemaphore\b", r"\bmutex\b", r"\bcpu\s+scheduling\b",
            r"\bround\s+robin\b", r"\bkernel\b", r"\bsystem\s+call\b", r"\bfork\s*\(", r"\bpage\s+fault\b",
            r"\bthrashing\b", r"\bcontext\s+switch\b", r"\bbanker's\s+algorithm\b", r"\bcritical\s+section\b",
            r"\binter-process\s+communication\b", r"\bipc\b", r"\bmonitors\b", r"\bpage\s+replacement\b",
            r"\blru\b", r"\bfifo\b", r"\bmemory\s+management\b", r"\bfile\s+system\b"
        ],
        "strong_markers": [r"\boperating\s+systems?\b", r"\bvirtual\s+memory\b", r"\bdeadlock\b", r"\bsemaphore\b", r"\bpage\s+replacement\b"],
        "common_subtopics": [
            ("Processes & Threads", [r"\bprocess\b", r"\bthread\b", r"\bcontext\s+switch\b", r"\bpcb\b"]),
            ("CPU Scheduling Algorithms", [r"\bscheduling\b", r"\bround\s+robin\b", r"\bfcfs\b", r"\bsjf\b", r"\bpriority\s+scheduling\b"]),
            ("Process Synchronization", [r"\bsynchronization\b", r"\bsemaphore\b", r"\bmutex\b", r"\bcritical\s+section\b", r"\bmonitors\b"]),
            ("Deadlocks & Avoidance", [r"\bdeadlock\b", r"\bbanker's\s+algorithm\b", r"\bresource\s+allocation\b", r"\bprevention\b"]),
            ("Memory Management & Paging", [r"\bvirtual\s+memory\b", r"\bpaging\b", r"\bsegmentation\b", r"\btlb\b", r"\bpage\s+fault\b"]),
            ("File Systems & Storage", [r"\bfile\s+system\b", r"\bdirectory\b", r"\bdisk\s+scheduling\b", r"\binode\b"]),
        ]
    },
    {
        "subject": "Database Management Systems (DBMS / SQL)",
        "category": "Database Systems",
        "suggested_title": "Database Management Systems Assessment",
        "icon": "database",
        "aliases": ["DBMS", "Database Management Systems", "Database Systems", "SQL", "RDBMS"],
        "keywords": [
            r"\bdatabase\b", r"\bdbms\b", r"\brdbms\b", r"\bsql\b", r"\bselect\s+.*\s+from\b",
            r"\bprimary\s+key\b", r"\bforeign\s+key\b", r"\bnormalization\b", r"\b1nf\b", r"\b2nf\b",
            r"\b3nf\b", r"\bbcnf\b", r"\bacid\s+properties\b", r"\btransaction\b", r"\binner\s+join\b",
            r"\bgroup\s+by\b", r"\ber\s+diagram\b", r"\brelational\s+algebra\b", r"\bconcurrency\s+control\b",
            r"\btwo-phase\s+locking\b", r"\bindexing\b", r"\bb-tree\b", r"\bquery\s+optimization\b", r"\bnosql\b"
        ],
        "strong_markers": [r"\bdbms\b", r"\brdbms\b", r"\bselect\s+.*\s+from\b", r"\bnormalization\b", r"\bacid\s+properties\b"],
        "common_subtopics": [
            ("Relational Model & ER Diagrams", [r"\ber\s+diagram\b", r"\bentity\b", r"\brelationship\b", r"\battribute\b", r"\btables\b"]),
            ("SQL Queries & DDL/DML", [r"\bsql\b", r"\bselect\b", r"\binsert\b", r"\bupdate\b", r"\bdelete\b", r"\bjoin\b", r"\baggregate\b"]),
            ("Normalization & Schema Design", [r"\bnormalization\b", r"\bfunctional\s+dependency\b", r"\b1nf\b", r"\b2nf\b", r"\b3nf\b", r"\bbcnf\b"]),
            ("Transactions & ACID Properties", [r"\btransaction\b", r"\bacid\b", r"\batomicity\b", r"\bconsistency\b", r"\bisolation\b", r"\bdurability\b"]),
            ("Concurrency Control & Recovery", [r"\bconcurrency\b", r"\blocking\b", r"\btwo-phase\b", r"\bdeadlock\b", r"\bcheckpoint\b"]),
            ("Indexing & Storage", [r"\bindexing\b", r"\bb-tree\b", r"\bhashing\b", r"\bquery\s+cost\b"]),
        ]
    },
    {
        "subject": "Computer Networks",
        "category": "Systems & Networking",
        "suggested_title": "Computer Networks Assessment",
        "icon": "network",
        "aliases": ["CN", "Networking", "Computer Network", "Data Communications & Networking"],
        "keywords": [
            r"\bcomputer\s+networks?\b", r"\bosi\s+model\b", r"\btcp/ip\b", r"\budp\b", r"\bpacket\b",
            r"\brouting\b", r"\bsubnetting\b", r"\bcidr\b", r"\bip\s+address\b", r"\bipv4\b", r"\bipv6\b",
            r"\bdns\b", r"\bdhcp\b", r"\bhttp\b", r"\bhttps\b", r"\bsocket\b", r"\brouter\b", r"\bswitch\b",
            r"\blan\b", r"\bwan\b", r"\bmac\s+address\b", r"\bethernet\b", r"\bcongestion\s+control\b",
            r"\bflow\s+control\b", r"\bthree-way\s+handshake\b", r"\bwindow\s+protocol\b"
        ],
        "strong_markers": [r"\bosi\s+model\b", r"\btcp/ip\b", r"\bsubnetting\b", r"\bcomputer\s+networks?\b", r"\brouting\b"],
        "common_subtopics": [
            ("Network Models (OSI & TCP/IP)", [r"\bosi\b", r"\btcp/ip\b", r"\blayers\b", r"\bphysical\b", r"\bdata\s+link\b", r"\bnetwork\b", r"\btransport\b", r"\bapplication\b"]),
            ("IP Addressing & Subnetting", [r"\bipv4\b", r"\bipv6\b", r"\bsubnet\b", r"\bcidr\b", r"\bmask\b"]),
            ("Routing Protocols & Algorithms", [r"\brouting\b", r"\bdistance\s+vector\b", r"\blink\s+state\b", r"\bospf\b", r"\brip\b", r"\bbgp\b"]),
            ("Transport Layer (TCP & UDP)", [r"\btcp\b", r"\budp\b", r"\bhandshake\b", r"\bflow\s+control\b", r"\bcongestion\b"]),
            ("Application Protocols", [r"\bhttp\b", r"\bhttps\b", r"\bdns\b", r"\bdhcp\b", r"\bftp\b", r"\bsmtp\b"]),
            ("Data Link & MAC Layer", [r"\bmac\b", r"\bethernet\b", r"\barp\b", r"\bcsma/cd\b", r"\berror\s+detection\b"]),
        ]
    },
    {
        "subject": "Machine Learning & Artificial Intelligence",
        "category": "Data Science & AI",
        "suggested_title": "Machine Learning & AI Assessment",
        "icon": "brain",
        "aliases": ["Machine Learning", "Artificial Intelligence", "AI", "ML", "Deep Learning"],
        "keywords": [
            r"\bmachine\s+learning\b", r"\bartificial\s+intelligence\b", r"\bdeep\s+learning\b",
            r"\bsupervised\s+learning\b", r"\bunsupervised\s+learning\b", r"\breinforcement\s+learning\b",
            r"\bneural\s+network\b", r"\bbackpropagation\b", r"\bgradient\s+descent\b", r"\bcnn\b",
            r"\brnn\b", r"\blstm\b", r"\btransformer\b", r"\boverfitting\b", r"\bregularization\b",
            r"\bhyperparameter\b", r"\bcross-validation\b", r"\bprecision\b", r"\brecall\b", r"\bf1-?score\b",
            r"\bscikit-learn\b", r"\btensorflow\b", r"\bpytorch\b", r"\bdecision\s+tree\b", r"\brandom\s+forest\b"
        ],
        "strong_markers": [r"\bmachine\s+learning\b", r"\bneural\s+network\b", r"\bgradient\s+descent\b", r"\bsupervised\s+learning\b"],
        "common_subtopics": [
            ("Supervised Learning (Regression & Classification)", [r"\bregression\b", r"\bclassification\b", r"\blinear\s+regression\b", r"\blogistic\s+regression\b", r"\bsvm\b"]),
            ("Unsupervised Learning & Clustering", [r"\bclustering\b", r"\bk-means\b", r"\bpca\b", r"\bdimensionality\s+reduction\b"]),
            ("Neural Networks & Deep Learning", [r"\bneural\s+network\b", r"\bactivation\s+function\b", r"\bbackpropagation\b", r"\bcnn\b", r"\brnn\b"]),
            ("Model Evaluation & Metrics", [r"\baccuracy\b", r"\bprecision\b", r"\brecall\b", r"\bf1\b", r"\broc\b", r"\bauc\b", r"\bconfusion\s+matrix\b"]),
            ("Optimization & Regularization", [r"\bgradient\s+descent\b", r"\boverfitting\b", r"\bdropout\b", r"\bl1\b", r"\bl2\b", r"\blearning\s+rate\b"]),
        ]
    },
    {
        "subject": "Software Engineering & Agile",
        "category": "Software Engineering",
        "suggested_title": "Software Engineering Assessment",
        "icon": "code",
        "aliases": ["Software Engineering", "SE", "Software Design & Architecture"],
        "keywords": [
            r"\bsoftware\s+engineering\b", r"\bsdlc\b", r"\bwaterfall\s+model\b", r"\bagile\b",
            r"\bscrum\b", r"\bsprint\b", r"\bdesign\s+patterns?\b", r"\bsingleton\b", r"\bfactory\s+pattern\b",
            r"\bobserver\s+pattern\b", r"\buml\b", r"\buse\s+case\b", r"\brefactoring\b", r"\bunit\s+testing\b",
            r"\bci/cd\b", r"\bsoftware\s+testing\b", r"\bblack\s+box\b", r"\bwhite\s+box\b", r"\bdevops\b"
        ],
        "strong_markers": [r"\bsoftware\s+engineering\b", r"\bsdlc\b", r"\bagile\b", r"\bscrum\b", r"\bdesign\s+patterns?\b"],
        "common_subtopics": [
            ("SDLC Models & Methodologies", [r"\bsdlc\b", r"\bwaterfall\b", r"\bagile\b", r"\bscrum\b", r"\bspiral\b"]),
            ("Software Architecture & Design Patterns", [r"\bdesign\s+patterns?\b", r"\bsingleton\b", r"\bfactory\b", r"\bobserver\b", r"\bmvc\b"]),
            ("Requirements Engineering & UML", [r"\brequirements\b", r"\buml\b", r"\buse\s+case\b", r"\bclass\s+diagram\b", r"\bsrs\b"]),
            ("Software Testing & Quality Assurance", [r"\btesting\b", r"\bunit\s+test\b", r"\bblack\s+box\b", r"\bwhite\s+box\b", r"\bqa\b", r"\bdebugging\b"]),
        ]
    },
    {
        "subject": "Cybersecurity & Cryptography",
        "category": "Security",
        "suggested_title": "Cybersecurity Assessment",
        "icon": "shield",
        "aliases": ["Cybersecurity", "Network Security", "Cryptography", "Information Security"],
        "keywords": [
            r"\bcybersecurity\b", r"\binformation\s+security\b", r"\bcryptography\b", r"\bencryption\b",
            r"\bdecryption\b", r"\baes\b", r"\brsa\b", r"\bhashing\b", r"\bsha-?256\b", r"\bpublic\s+key\b",
            r"\bprivate\s+key\b", r"\bpki\b", r"\bdigital\s+signature\b", r"\bfirewall\b", r"\bmalware\b",
            r"\bsql\s+injection\b", r"\bxss\b", r"\bauthentication\b", r"\bauthorization\b", r"\bjwt\b",
            r"\bssl/tls\b", r"\bvulnerability\b", r"\bpenetration\s+testing\b"
        ],
        "strong_markers": [r"\bcryptography\b", r"\bencryption\b", r"\bcybersecurity\b", r"\brsa\b", r"\baes\b"],
        "common_subtopics": [
            ("Cryptography & Ciphers", [r"\bencryption\b", r"\brsa\b", r"\baes\b", r"\bdes\b", r"\bcipher\b", r"\bkey\b"]),
            ("Authentication & Integrity", [r"\bhashing\b", r"\bdigital\s+signature\b", r"\bpki\b", r"\bcertificate\b", r"\bjwt\b"]),
            ("Network & Web Security Threats", [r"\bmalware\b", r"\bphishing\b", r"\bxss\b", r"\bsql\s+injection\b", r"\bddos\b", r"\bfirewall\b"]),
        ]
    },
    {
        "subject": "Web Technologies & JavaScript",
        "category": "Web Development",
        "suggested_title": "Web Development Assessment",
        "icon": "globe",
        "aliases": ["Web Technologies", "Web Development", "JavaScript", "HTML & CSS"],
        "keywords": [
            r"\bhtml5?\b", r"\bcss3?\b", r"\bjavascript\b", r"\bdom\b", r"\bflexbox\b", r"\bcss\s+grid\b",
            r"\bresponsive\s+design\b", r"\breact\b", r"\bnode\.?js\b", r"\bexpress\b", r"\brest\s+api\b",
            r"\bjson\b", r"\btypescript\b", r"\basync/await\b", r"\bpromise\b", r"\bevent\s+listener\b",
            r"\bclient-side\b", r"\bserver-side\b"
        ],
        "strong_markers": [r"\bhtml5?\b", r"\bcss3?\b", r"\bjavascript\b", r"\bdom\b", r"\breact\b"],
        "common_subtopics": [
            ("HTML & Semantic Markup", [r"\bhtml\b", r"\btags\b", r"\belements\b", r"\bforms\b", r"\bsemantic\b"]),
            ("CSS Styling, Flexbox & Grid", [r"\bcss\b", r"\bflexbox\b", r"\bgrid\b", r"\bselector\b", r"\bmedia\s+query\b"]),
            ("JavaScript & DOM Manipulation", [r"\bjavascript\b", r"\bdom\b", r"\bevent\b", r"\bcallback\b", r"\basync\b"]),
            ("Web APIs & Frameworks", [r"\brest\b", r"\bapi\b", r"\bjson\b", r"\breact\b", r"\bnode\b", r"\bhttp\b"]),
        ]
    }
]


def extract_document_header_subject(text: str) -> Optional[Dict[str, str]]:
    """
    Scans the first 1-3 pages of the PDF for explicit course title / subject declarations.
    E.g.
    'DATA STRUCTURES Regulation: R24' -> 'Data Structures'
    'UNIT 2 -LINKED LISTS' -> 'Linked Lists'
    'Course: Operating Systems' -> 'Operating Systems'
    """
    sample = text[:3500].replace("\r", "\n")
    lines = [l.strip() for l in sample.split("\n") if l.strip()]

    subject_cand = None
    unit_cand = None

    for line in lines[:30]:
        # Filter out page markers and faculty credentials
        if re.search(r"--- Page \d+ ---|Mrs\.|Mr\.|Dr\.|Prof\.|Dist\.|Asst|Professor|MVGRCE|College|University|Institute", line, re.IGNORECASE):
            continue

        # Pattern 1: "DATA STRUCTURES Regulation: R24" or "OPERATING SYSTEMS Course Code: CS201"
        m_reg = re.match(r"^([A-Za-z\s&/]{4,50})\s+(?:Regulation|Reg|Code|Course\s+Code|Paper\s+Code|Branch)[:\s].*$", line, re.IGNORECASE)
        if m_reg and not subject_cand:
            s = m_reg.group(1).strip()
            if len(s.split()) >= 1 and len(s) >= 4:
                subject_cand = s.title()
                continue

        # Pattern 2: "Subject: Data Structures" or "Course: Operating Systems"
        m_sub = re.match(r"^(?:Subject|Course|Course\s+Title|Title)\s*[:\-]\s*([A-Za-z0-9\s&/]{4,50})$", line, re.IGNORECASE)
        if m_sub and not subject_cand:
            s = m_sub.group(1).strip()
            if len(s) >= 4:
                subject_cand = s.title()
                continue

        # Pattern 3: "UNIT 2 -LINKED LISTS" or "Unit II: Stacks and Queues" or "Chapter 3: Deadlocks"
        m_unit = re.match(r"^(?:Unit|Chapter|Module|Part)\s+[0-9IVXLCDM]+\s*[:\-–—\s]\s*([A-Za-z0-9\s&/\-_,]{3,60})$", line, re.IGNORECASE)
        if m_unit and not unit_cand:
            u = m_unit.group(1).strip().strip(":#-–— ")
            if len(u) >= 3:
                unit_cand = u.title()
                continue

        # Pattern 4: Prominent uppercase title on its own line: "DATA STRUCTURES", "OPERATING SYSTEMS"
        if line.isupper() and 1 <= len(line.split()) <= 5 and not subject_cand:
            if not re.search(r"\b(?:UNIT|CHAPTER|MODULE|PAGE|NOTE|AUTHOR|REGULATION|SLIDE|DEPT|DEPARTMENT|LC\s*\d+)\b", line):
                clean_title = re.sub(r"[^A-Za-z\s&]", "", line).strip()
                if len(clean_title) >= 4:
                    subject_cand = clean_title.title()

    if subject_cand or unit_cand:
        return {"subject": subject_cand, "unit": unit_cand}
    return None


def clean_extracted_heading(heading: str) -> str:
    """Cleans raw PDF line into human-readable course topic."""
    h = heading.strip().strip(":#-–—• ")
    # Remove LC markers like "LC1: ", "LC 4: "
    h = re.sub(r"^LC\s*\d+\s*[:\-\.]\s*", "", h, flags=re.IGNORECASE)
    # Remove unit/chapter prefixes like "Unit 2 - ", "Unit II: "
    h = re.sub(r"^(?:Unit|Chapter|Module|Section)\s+[0-9IVXLCDM]+\s*[:\-\–—\.]\s*", "", h, flags=re.IGNORECASE)
    # Remove regulation markers
    h = re.sub(r"\bRegulation:\s*R\d+\b", "", h, flags=re.IGNORECASE)
    h = re.sub(r"^R\d+\s*\d*$", "", h, flags=re.IGNORECASE)
    return h.strip().strip(":#-–—• ")


def is_junk_heading(h: str) -> bool:
    """Filters out formulas, code fragments, regulations, and noise."""
    s = h.strip()
    if len(s) < 4 or len(s) > 85:
        return True
    if re.search(r"\b(?:Regulation|R\d+|Professor|Prof\.|Dr\.|Faculty|Department|Dept\.|College|University|Institute|MVGRCE|Page\s*\d+|Slide\s*\d+)\b", s, re.IGNORECASE):
        return True
    if re.search(r"[{};]|#include|\b(?:struct|malloc|sizeof|printf|scanf|NULL|return|void|int|float|char)\b", s):
        return True
    if re.search(r"-->|->|==|!=|[=><]\s*\d+", s):
        return True
    if re.match(r"^R\s*\d+", s):
        return True
    return False


def extract_document_headings(text: str) -> List[str]:
    """Extracts top chapter, section, and topic titles from PDF text."""
    headings = []
    lines = text.replace("\r", "\n").split("\n")
    for line in lines:
        line_s = line.strip()
        if len(line_s) > 4 and len(line_s) < 95:
            m = re.match(r"^(?:(?:Chapter|Unit|Module|Section|Topic|Part|LC\s*\d+)\s*[:\-\.\s\d\w]+[:\s]+)(.+)$", line_s, re.IGNORECASE)
            if m:
                cand = clean_extracted_heading(m.group(1))
                if cand and not is_junk_heading(cand) and cand not in headings:
                    headings.append(cand)
            elif line_s.isupper() and 2 <= len(line_s.split()) <= 6:
                cand = clean_extracted_heading(line_s.title())
                if cand and not is_junk_heading(cand) and cand not in headings:
                    headings.append(cand)
        if len(headings) >= 8:
            break
    return headings


def detect_pdf_topic(text: str, filename: str = "") -> Dict[str, Any]:
    """
    Rapid, deterministic, content-grounded topic & subject classification.
    Analyzes document text, keywords, syntax patterns, headings, and filename.
    Returns structured subject details so the teacher instantly knows what
    subject/topic the uploaded PDF belongs to.
    """
    if not text or len(text.strip()) < 10:
        return {
            "subject": "Unrecognized Document",
            "category": "General Document",
            "suggested_title": "Course Assessment",
            "topics": ["General Reading"],
            "summary": "The uploaded PDF document contains minimal or unreadable text.",
            "confidence": 0.2,
            "is_matched": False,
            "filename": filename
        }

    # Combined text samples for analysis
    sample_text = text[:12000].lower()
    full_sample = text[:30000].lower()
    filename_lower = filename.lower()
    header_info = extract_document_header_subject(text)

    domain_scores: List[Dict[str, Any]] = []

    for domain in DOMAIN_KNOWLEDGE_BASE:
        score = 0.0
        matched_keywords = []

        # 0. Header match bonus (strong authoritative signal from document itself)
        if header_info and header_info.get("subject"):
            h_subj = header_info["subject"].lower()
            d_subj = domain["subject"].lower()
            aliases = [a.lower() for a in domain.get("aliases", [])]
            if h_subj in d_subj or d_subj in h_subj or any(a in h_subj or h_subj in a for a in aliases):
                score += 80.0
                matched_keywords.append(f"header:{header_info['subject']}")

        # 1. Filename match weight (very strong hint)
        fn_clean = re.sub(r"[^a-z0-9]", " ", filename_lower)
        subj_words = [w.lower() for w in domain["subject"].split() if len(w) > 2]
        aliases = [a.lower() for a in domain.get("aliases", [])]
        for w in subj_words:
            if re.search(rf"\b{re.escape(w)}\b", fn_clean):
                score += 35.0
                matched_keywords.append(f"filename:{w}")
        for a in aliases:
            if re.search(rf"\b{re.escape(a)}\b", fn_clean):
                score += 45.0
                matched_keywords.append(f"filename_alias:{a}")

        # 2. Strong markers match
        for marker_regex in domain.get("strong_markers", []):
            matches = len(re.findall(marker_regex, sample_text, re.IGNORECASE))
            if matches > 0:
                score += min(matches * 8.0, 40.0)
                matched_keywords.append(marker_regex.replace(r"\b", "").strip())

        # 3. Keyword density match
        for kw_regex in domain["keywords"]:
            count = len(re.findall(kw_regex, sample_text, re.IGNORECASE))
            if count > 0:
                score += min(count * 2.5, 15.0)
                clean_kw = kw_regex.replace(r"\b", "").replace(r"\s+", " ").strip()
                if clean_kw not in matched_keywords:
                    matched_keywords.append(clean_kw)

        # 4. Anti-Collision Rule:
        # C/C++ syntax penalty if Data Structures markers dominate the material.
        # Data structure implementations in C (struct node, malloc, printf) do not make
        # the course a C programming course; the course subject is Data Structures & Algorithms.
        if domain["subject"] == "C / C++ Programming":
            dsa_count = len(re.findall(r"\b(data\s+structures?|linked\s+lists?|binary\s+tree|stack|queue|traversal|bst)\b", sample_text, re.IGNORECASE))
            if dsa_count >= 8:
                score *= 0.25

        if score > 0:
            domain_scores.append({
                "domain": domain,
                "score": score,
                "matched_count": len(matched_keywords)
            })

    # Sort domains by score
    domain_scores.sort(key=lambda x: x["score"], reverse=True)

    if domain_scores and domain_scores[0]["score"] >= 15.0:
        top = domain_scores[0]
        domain = top["domain"]
        raw_score = top["score"]
        # Normalize confidence between 0.70 and 0.99
        confidence = min(0.99, max(0.70, 0.70 + (raw_score / 200.0)))

        # Detect specific subtopics present in this document
        detected_topics: List[str] = []
        # If we have an explicit unit header from the document (e.g. "Linked Lists"), include it first
        if header_info and header_info.get("unit"):
            detected_topics.append(header_info["unit"])

        for subtopic_title, subtopic_patterns in domain.get("common_subtopics", []):
            found = False
            for pat in subtopic_patterns:
                if re.search(pat, full_sample, re.IGNORECASE):
                    found = True
                    break
            if found and subtopic_title not in detected_topics:
                detected_topics.append(subtopic_title)

        # Supplement with clean document headings if available
        doc_headings = extract_document_headings(text)
        for h in doc_headings:
            if h not in detected_topics and len(detected_topics) < 6:
                detected_topics.append(h)

        if not detected_topics:
            detected_topics = [f"{domain['subject']} Core Concepts", "Key Definitions & Terminology"]

        # Formulate suggested title tailored with unit if present
        if header_info and header_info.get("unit"):
            suggested_title = f"{domain['subject']} - {header_info['unit']} Assessment"
        else:
            suggested_title = domain["suggested_title"]

        # Craft concise summary
        topic_preview = ", ".join(detected_topics[:3])
        summary = f"This document contains educational content on {domain['subject']} ({domain['category']}), emphasizing {topic_preview}."

        return {
            "subject": domain["subject"],
            "category": domain["category"],
            "suggested_title": suggested_title,
            "topics": detected_topics[:6],
            "summary": summary,
            "confidence": round(confidence, 2),
            "is_matched": True,
            "filename": filename
        }

    # Fallback if no predefined domain matched: Dynamically build subject from document header or filename
    subject_title = (header_info and header_info.get("subject")) or "Academic Course Material"
    unit_title = header_info and header_info.get("unit")
    suggested = f"{subject_title} Assessment" if not unit_title else f"{subject_title} - {unit_title} Assessment"

    doc_headings = extract_document_headings(text)
    topics_list = ([unit_title] if unit_title else []) + [h for h in doc_headings if h != unit_title]
    if not topics_list:
        topics_list = [f"{subject_title} Core Concepts"]

    return {
        "subject": subject_title,
        "category": "Academic Course Material",
        "suggested_title": suggested,
        "topics": topics_list[:6],
        "summary": f"Uploaded course document covering {subject_title}, emphasizing {', '.join(topics_list[:3])}.",
        "confidence": 0.85 if header_info else 0.65,
        "is_matched": True if header_info else False,
        "filename": filename
    }
